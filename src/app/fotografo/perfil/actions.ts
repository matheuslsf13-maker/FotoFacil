'use server'

import { revalidatePath } from 'next/cache'
import type { ActionState } from '@/lib/action-state'
import { requirePhotographer } from '@/lib/auth/guards'
import { errorMessage } from '@/lib/errors'
import { uploadPhotographerPhoto } from '@/lib/photographers/photo'
import { createClient } from '@/lib/supabase/server'
import { parseForm, profileSchema } from '@/lib/validation'

export async function updateProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { photographerId } = await requirePhotographer()
  const parsed = parseForm(profileSchema, Object.fromEntries(formData))
  if (!parsed.ok) return { error: parsed.error }
  const patch: Record<string, unknown> = { ...parsed.data }
  const photo = formData.get('photo')
  if (photo instanceof File && photo.size > 0) {
    try {
      patch.photo_path = await uploadPhotographerPhoto(photographerId, photo)
    } catch (e) {
      return { error: (e as Error).message }
    }
  }
  const supabase = await createClient()
  const { error } = await supabase.from('photographers').update(patch).eq('id', photographerId)
  if (error) return { error: errorMessage(error) }
  revalidatePath('/fotografo/perfil')
  return { error: null, ok: true }
}
