import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SearchRepo } from './search'

function check(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

export function createSupabaseSearchRepo(db: SupabaseClient): SearchRepo {
  return {
    async getRegistration(id) {
      const { data, error } = await db.from('registrations').select('id, event_id, status, face_consent_at').eq('id', id).maybeSingle()
      check(error)
      return data
    },
    async getEvent(eventId) {
      const { data, error } = await db
        .from('events')
        .select('status, expires_at, rekognition_collection_id')
        .eq('id', eventId)
        .maybeSingle()
      check(error)
      return data
    },
    async getSearchSettings() {
      const { data, error } = await db.from('settings').select('face_match_threshold, daily_search_limit').eq('id', 1).single()
      check(error)
      return { faceMatchThreshold: data!.face_match_threshold, dailySearchLimit: data!.daily_search_limit }
    },
    async countSearchesSince(registrationId, sinceIso) {
      const { count, error } = await db
        .from('search_log')
        .select('id', { count: 'exact', head: true })
        .eq('registration_id', registrationId)
        .gte('created_at', sinceIso)
      check(error)
      return count ?? 0
    },
    async logSearch(registrationId) {
      const { error } = await db.from('search_log').insert({ registration_id: registrationId })
      check(error)
    },
    async setConsent(registrationId) {
      const { error } = await db.from('registrations').update({ face_consent_at: new Date().toISOString() }).eq('id', registrationId)
      check(error)
    },
    async filterLiveMedia(eventId, mediaIds) {
      if (mediaIds.length === 0) return []
      const { data, error } = await db
        .from('media')
        .select('id')
        .eq('event_id', eventId)
        .eq('status', 'ready')
        .is('deleted_at', null)
        .in('id', mediaIds)
      check(error)
      return (data ?? []).map(row => row.id as string)
    },
    async recordMatches(registrationId, mediaIds) {
      const { error } = await db.rpc('record_face_search', { p_registration_id: registrationId, p_media_ids: mediaIds })
      check(error)
    },
  }
}
