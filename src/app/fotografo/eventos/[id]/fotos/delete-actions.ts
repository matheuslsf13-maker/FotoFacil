'use server'

import { revalidatePath } from 'next/cache'
import type { ActionState } from '@/lib/action-state'
import { getSessionProfile } from '@/lib/auth/session'
import { getFaceProvider } from '@/lib/faces'
import { deleteMedia, expireEvent } from '@/lib/media/deletion'
import { createSupabaseDeletionRepo } from '@/lib/media/deletion-repo'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

function deps() {
  return { repo: createSupabaseDeletionRepo(createAdminClient()), faces: getFaceProvider() }
}

function revalidate(eventId: string) {
  revalidatePath(`/fotografo/eventos/${eventId}`)
  revalidatePath(`/admin/eventos/${eventId}`)
}

/** Photographer (own events) or admin (any event). Ownership is checked by reading through RLS. */
export async function deleteSelectedMedia(eventId: string, mediaIds: string[]): Promise<ActionState> {
  if (!(await getSessionProfile())) return { error: 'Sessão expirada. Entre de novo.' }
  const supabase = await createClient()
  const { data } = await supabase.from('media').select('id').eq('event_id', eventId).in('id', mediaIds)
  const allowed = (data ?? []).map(row => row.id as string)
  if (allowed.length === 0) return { error: 'Nada para excluir.' }
  await deleteMedia(allowed, deps())
  revalidate(eventId)
  return { error: null, ok: true }
}

export async function closeEventAndDeleteMedia(eventId: string): Promise<ActionState> {
  if (!(await getSessionProfile())) return { error: 'Sessão expirada. Entre de novo.' }
  const supabase = await createClient()
  const { data: event } = await supabase.from('events').select('id').eq('id', eventId).maybeSingle()
  if (!event) return { error: 'Evento não encontrado.' }
  await expireEvent(eventId, deps())
  revalidate(eventId)
  return { error: null, ok: true }
}
