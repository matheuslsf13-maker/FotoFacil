'use server'

import { revalidatePath } from 'next/cache'
import type { ActionState } from '@/lib/action-state'
import { requireAdmin } from '@/lib/auth/guards'
import { errorMessage } from '@/lib/errors'
import { uploadPhotographerPhoto } from '@/lib/photographers/photo'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { newPhotographerSchema, parseForm, photographerSchema } from '@/lib/validation'

export async function createPhotographer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin()
  const parsed = parseForm(newPhotographerSchema, Object.fromEntries(formData))
  if (!parsed.ok) return { error: parsed.error }
  const admin = createAdminClient()
  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
  })
  if (authError || !created.user) {
    return {
      error: authError?.message.toLowerCase().includes('already')
        ? 'Já existe um usuário com esse e-mail.'
        : 'Não foi possível criar o login.',
    }
  }
  const userId = created.user.id
  const { error: profileError } = await admin.from('profiles').insert({ id: userId, role: 'photographer' })
  const { error: photographerError } = profileError
    ? { error: profileError }
    : await admin.from('photographers').insert({ ...parsed.data.photographer, profile_id: userId })
  if (profileError || photographerError) {
    await admin.auth.admin.deleteUser(userId)
    return { error: 'Não foi possível salvar o fotógrafo.' }
  }
  revalidatePath('/admin/fotografos')
  return { error: null, ok: true }
}

export async function updatePhotographer(photographerId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin()
  const parsed = parseForm(photographerSchema, Object.fromEntries(formData))
  if (!parsed.ok) return { error: parsed.error }
  const patch: Record<string, unknown> = { ...parsed.data, active: formData.get('active') === 'on' }
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
  revalidatePath(`/admin/fotografos/${photographerId}`)
  revalidatePath('/admin/fotografos')
  return { error: null, ok: true }
}
