import { createClient } from '@supabase/supabase-js'
import { readState } from './state'

export default async function globalTeardown() {
  const state = readState()
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false },
  })
  const { data: events } = await admin.from('events').select('id').eq('photographer_id', state.photographerId)
  for (const { id } of events ?? []) {
    const { data: media } = await admin.from('media').select('storage_path, thumb_path').eq('event_id', id)
    const paths = (media ?? []).flatMap(m => [m.storage_path, m.thumb_path])
    if (paths.length) await admin.storage.from('media').remove(paths)
    await admin.from('registrations').delete().eq('event_id', id)
    await admin.from('media').delete().eq('event_id', id)
    await admin.from('events').delete().eq('id', id)
  }
  await admin.from('clients').delete().eq('phone_e164', state.clientPhone)
  await admin.from('photographers').delete().eq('id', state.photographerId)
  await admin.auth.admin.deleteUser(state.userId)
}
