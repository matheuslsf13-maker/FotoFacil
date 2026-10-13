import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export type Role = 'admin' | 'photographer'

export interface SessionProfile {
  userId: string
  role: Role
  photographerId: string | null
}

export const getSessionProfile = cache(async (): Promise<SessionProfile | null> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (!profile) return null
  let photographerId: string | null = null
  if (profile.role === 'photographer') {
    const { data: photographer } = await supabase
      .from('photographers')
      .select('id, active')
      .eq('profile_id', user.id)
      .maybeSingle()
    photographerId = photographer?.active ? photographer.id : null
  }
  return { userId: user.id, role: profile.role as Role, photographerId }
})
