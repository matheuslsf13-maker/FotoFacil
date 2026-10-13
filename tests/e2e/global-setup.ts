import { createClient } from '@supabase/supabase-js'
import { writeState } from './state'

export default async function globalSetup() {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false },
  })
  const stamp = Date.now()
  const email = `e2e-foto-${stamp}@example.com`
  const password = `E2e-${stamp}-senha`
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`)
  const { error: profileError } = await admin.from('profiles').insert({ id: data.user.id, role: 'photographer' })
  if (profileError) throw new Error(profileError.message)
  const { data: photographer, error: photographerError } = await admin
    .from('photographers')
    .insert({
      profile_id: data.user.id,
      name: 'Fotógrafo E2E',
      whatsapp: '+5571999990000',
      default_price_cents: 5000,
      commission_type: 'percent',
      commission_value: 1500,
    })
    .select('id')
    .single()
  if (photographerError || !photographer) throw new Error(photographerError?.message)
  writeState({
    email,
    password,
    userId: data.user.id,
    photographerId: photographer.id,
    clientPhone: `+55719${String(stamp).slice(-8)}`,
    eventName: `Festa E2E ${stamp}`,
  })
}
