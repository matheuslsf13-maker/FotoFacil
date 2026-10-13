/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase embeds are untyped without generated types */
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface PublicEvent {
  id: string
  name: string
  slug: string
  start_date: string
  end_date: string
  expires_at: string
  status: string
  price_cents: number
  photographer: { name: string; photo_path: string | null; whatsapp: string }
}

const EVENT_COLUMNS = 'id, name, slug, start_date, end_date, expires_at, status, price_cents, photographers(name, photo_path, whatsapp)'

function toPublicEvent(row: Record<string, any>): PublicEvent {
  const { photographers, ...event } = row
  return { ...(event as Omit<PublicEvent, 'photographer'>), photographer: photographers }
}

export async function listActiveEvents(db: SupabaseClient, today: string): Promise<PublicEvent[]> {
  const { data, error } = await db
    .from('events')
    .select(EVENT_COLUMNS)
    .eq('status', 'active')
    .gte('expires_at', today)
    .order('start_date', { ascending: false })
    .limit(100)
  if (error) throw new Error(error.message)
  return (data ?? []).map(toPublicEvent)
}

export async function getPublicEvent(db: SupabaseClient, slug: string): Promise<PublicEvent | null> {
  const { data, error } = await db.from('events').select(EVENT_COLUMNS).eq('slug', slug).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? toPublicEvent(data) : null
}

export async function listEventNames(db: SupabaseClient, eventId: string): Promise<Array<{ registrationId: string; fullName: string }>> {
  const { data, error } = await db.from('registrations').select('id, clients(full_name)').eq('event_id', eventId)
  if (error) throw new Error(error.message)
  return (data ?? []).map((row: Record<string, any>) => ({ registrationId: row.id, fullName: row.clients.full_name }))
}

export interface AccessRegistration {
  id: string
  event_id: string
  status: 'wristband' | 'paid'
  full_name: string
  phone_e164: string
}

export async function getRegistrationForAccess(db: SupabaseClient, id: string): Promise<AccessRegistration | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const { data, error } = await db
    .from('registrations')
    .select('id, event_id, status, clients(full_name, phone_e164)')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  const row = data as Record<string, any>
  return { id: row.id, event_id: row.event_id, status: row.status, full_name: row.clients.full_name, phone_e164: row.clients.phone_e164 }
}
