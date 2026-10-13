/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase embeds are untyped without generated types */
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface ClientRegistration {
  id: string
  event_id: string
  status: 'wristband' | 'paid'
  face_consent_at: string | null
  last_search_at: string | null
  full_name: string
}

export async function getClientRegistration(db: SupabaseClient, id: string): Promise<ClientRegistration | null> {
  const { data, error } = await db
    .from('registrations')
    .select('id, event_id, status, face_consent_at, last_search_at, clients(full_name)')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  const row = data as Record<string, any>
  return {
    id: row.id,
    event_id: row.event_id,
    status: row.status,
    face_consent_at: row.face_consent_at,
    last_search_at: row.last_search_at,
    full_name: row.clients.full_name,
  }
}

export interface ClientMediaRow {
  id: string
  type: 'photo' | 'video'
  taken_on: string
  storage_path: string
  thumb_path: string
  created_at: string
}

export async function listClientMedia(db: SupabaseClient, registrationId: string): Promise<ClientMediaRow[]> {
  const { data, error } = await db
    .from('client_matches')
    .select('media!inner(id, type, taken_on, storage_path, thumb_path, created_at, deleted_at)')
    .eq('registration_id', registrationId)
    .eq('hidden', false)
    .is('media.deleted_at', null)
  if (error) throw new Error(error.message)
  return (data ?? [])
    .map((row: Record<string, any>) => row.media as ClientMediaRow)
    .sort((a, b) => a.taken_on.localeCompare(b.taken_on) || a.created_at.localeCompare(b.created_at))
}

export async function latestEventMediaAt(db: SupabaseClient, eventId: string): Promise<string | null> {
  const { data, error } = await db
    .from('media')
    .select('created_at')
    .eq('event_id', eventId)
    .eq('status', 'ready')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data?.created_at ?? null
}
