'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { ActionState } from '@/lib/action-state'
import { requirePhotographer } from '@/lib/auth/guards'
import { eventSlug } from '@/lib/domain/slug'
import { errorMessage } from '@/lib/errors'
import { createClient } from '@/lib/supabase/server'
import { eventSchema, parseForm } from '@/lib/validation'

export async function createEvent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { photographerId } = await requirePhotographer()
  const parsed = parseForm(eventSchema, Object.fromEntries(formData))
  if (!parsed.ok) return { error: parsed.error }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('events')
    .insert({ ...parsed.data, photographer_id: photographerId, slug: eventSlug(parsed.data.name) })
    .select('id')
    .single()
  if (error || !data) return { error: errorMessage(error) }
  redirect(`/fotografo/eventos/${data.id}`)
}

export async function updateEvent(eventId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePhotographer()
  const parsed = parseForm(eventSchema, Object.fromEntries(formData))
  if (!parsed.ok) return { error: parsed.error }
  const supabase = await createClient()
  const { data, error } = await supabase.from('events').update(parsed.data).eq('id', eventId).select('id')
  if (error) return { error: errorMessage(error) }
  if (!data?.length) return { error: 'Evento não encontrado.' }
  revalidatePath(`/fotografo/eventos/${eventId}`)
  return { error: null, ok: true }
}
