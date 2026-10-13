'use server'

import { revalidatePath } from 'next/cache'
import type { ActionState } from '@/lib/action-state'
import { requirePhotographer } from '@/lib/auth/guards'
import { getSessionProfile } from '@/lib/auth/session'
import { maskPhone, normalizePhone } from '@/lib/domain/phone'
import { errorMessage } from '@/lib/errors'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { clientSchema, parseForm } from '@/lib/validation'

export interface ClientSearchResult {
  id: string
  fullName: string
  maskedPhone: string
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, c => `\\${c}`)
}

/** Searches the shared client registry. Runs with the service key because the
 * registry spans every photographer; only masked phones leave the server. */
export async function searchClients(query: string): Promise<ClientSearchResult[]> {
  await requirePhotographer()
  const q = query.trim()
  if (q.length < 2) return []
  const db = createAdminClient()
  let request = db.from('clients').select('id, full_name, phone_e164').order('full_name').limit(20)
  if (/^[\d\s()+-]+$/.test(q)) {
    const digits = q.replace(/\D/g, '')
    if (digits.length < 4) return []
    const phone = normalizePhone(q)
    request = phone ? request.eq('phone_e164', phone) : request.like('phone_e164', `%${digits}`)
  } else {
    request = request.ilike('full_name', `%${escapeLike(q)}%`)
  }
  const { data, error } = await request
  if (error) throw new Error(errorMessage(error))
  return (data ?? []).map(c => ({ id: c.id, fullName: c.full_name, maskedPhone: maskPhone(c.phone_e164) }))
}

function revalidateEvent(eventId: string) {
  revalidatePath(`/fotografo/eventos/${eventId}`)
  revalidatePath(`/admin/eventos/${eventId}`)
}

export async function deliverToClient(eventId: string, clientId: string, termsAccepted: boolean): Promise<ActionState> {
  await requirePhotographer()
  const supabase = await createClient()
  const { error } = await supabase.rpc('deliver_wristband', {
    p_event_id: eventId,
    p_client_id: clientId,
    p_terms_accepted: termsAccepted,
  })
  if (error) return { error: errorMessage(error) }
  revalidateEvent(eventId)
  return { error: null, ok: true }
}

export async function registerAndDeliver(eventId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePhotographer()
  if (formData.get('terms') !== 'on') return { error: errorMessage({ message: 'terms_required' }) }
  const parsed = parseForm(clientSchema, { fullName: formData.get('fullName'), phone: formData.get('phone') })
  if (!parsed.ok) return { error: parsed.error }
  const supabase = await createClient()
  const { data: clientId, error } = await supabase.rpc('find_or_create_client', {
    p_full_name: parsed.data.full_name,
    p_phone_e164: parsed.data.phone_e164,
  })
  if (error || !clientId) return { error: errorMessage(error) }
  return deliverToClient(eventId, clientId as string, true)
}

/** Used by the photographer and by the admin event page; the database function decides who may confirm. */
export async function confirmPayment(eventId: string, registrationId: string): Promise<ActionState> {
  if (!(await getSessionProfile())) return { error: 'Sessão expirada. Entre de novo.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('confirm_manual_payment', { p_registration_id: registrationId })
  if (error) return { error: errorMessage(error) }
  revalidateEvent(eventId)
  return { error: null, ok: true }
}

/** Used by the photographer and by the admin event page; the database function applies the undo rules per role. */
export async function undoPayment(eventId: string, registrationId: string): Promise<ActionState> {
  if (!(await getSessionProfile())) return { error: 'Sessão expirada. Entre de novo.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('undo_manual_payment', { p_registration_id: registrationId })
  if (error) return { error: errorMessage(error) }
  revalidateEvent(eventId)
  return { error: null, ok: true }
}
