'use server'

import { redirect } from 'next/navigation'
import type { ActionState } from '@/lib/action-state'
import { createClient } from '@/lib/supabase/server'

export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.user) return { error: 'E-mail ou senha inválidos.' }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle()
  if (!profile) {
    await supabase.auth.signOut()
    return { error: 'Usuário sem acesso ao FotoFácil.' }
  }
  redirect(profile.role === 'admin' ? '/admin' : '/fotografo')
}

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
