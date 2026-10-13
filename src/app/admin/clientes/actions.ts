'use server'

import { revalidatePath } from 'next/cache'
import type { ActionState } from '@/lib/action-state'
import { requireAdmin } from '@/lib/auth/guards'
import { errorMessage } from '@/lib/errors'
import { createClient } from '@/lib/supabase/server'
import { clientSchema, parseForm } from '@/lib/validation'

export async function createClientRecord(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireAdmin()
  const parsed = parseForm(clientSchema, Object.fromEntries(formData))
  if (!parsed.ok) return { error: parsed.error }
  const supabase = await createClient()
  const { error } = await supabase.from('clients').insert({ ...parsed.data, created_by: session.userId })
  if (error) return { error: errorMessage(error) }
  revalidatePath('/admin/clientes')
  return { error: null, ok: true }
}

export async function updateClientRecord(clientId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin()
  const parsed = parseForm(clientSchema, Object.fromEntries(formData))
  if (!parsed.ok) return { error: parsed.error }
  const supabase = await createClient()
  const { error } = await supabase.from('clients').update(parsed.data).eq('id', clientId)
  if (error) return { error: errorMessage(error) }
  revalidatePath(`/admin/clientes/${clientId}`)
  return { error: null, ok: true }
}
