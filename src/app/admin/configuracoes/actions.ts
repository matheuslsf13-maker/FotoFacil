'use server'

import { revalidatePath } from 'next/cache'
import type { ActionState } from '@/lib/action-state'
import { requireAdmin } from '@/lib/auth/guards'
import { errorMessage } from '@/lib/errors'
import { createClient } from '@/lib/supabase/server'
import { parseForm, settingsSchema } from '@/lib/validation'

export async function updateSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin()
  const parsed = parseForm(settingsSchema, Object.fromEntries(formData))
  if (!parsed.ok) return { error: parsed.error }
  const supabase = await createClient()
  const { error } = await supabase
    .from('settings')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', 1)
  if (error) return { error: errorMessage(error) }
  revalidatePath('/admin/configuracoes')
  return { error: null, ok: true }
}
