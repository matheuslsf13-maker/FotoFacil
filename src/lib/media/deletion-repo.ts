import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DeletableMedia, MediaDeletionRepo } from './deletion'
import { removeMediaObjects } from './processing-repo'

function check(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

export function createSupabaseDeletionRepo(db: SupabaseClient): MediaDeletionRepo {
  return {
    async getLiveMedia(ids) {
      if (ids.length === 0) return []
      const { data, error } = await db
        .from('media')
        .select('id, event_id, type, storage_path, thumb_path, frame_count')
        .in('id', ids)
        .is('deleted_at', null)
      check(error)
      return (data ?? []) as DeletableMedia[]
    },
    async listLiveMediaIds(eventId) {
      const { data, error } = await db.from('media').select('id').eq('event_id', eventId).is('deleted_at', null)
      check(error)
      return (data ?? []).map(row => row.id as string)
    },
    async getFaces(mediaIds) {
      if (mediaIds.length === 0) return []
      const { data, error } = await db.from('media_faces').select('face_id, event_id').in('media_id', mediaIds)
      check(error)
      return data ?? []
    },
    async getEventCollection(eventId) {
      const { data, error } = await db.from('events').select('rekognition_collection_id').eq('id', eventId).single()
      check(error)
      return data?.rekognition_collection_id ?? null
    },
    async setEventCollection(eventId, collectionId) {
      const { error } = await db.from('events').update({ rekognition_collection_id: collectionId }).eq('id', eventId)
      check(error)
    },
    async removeObjects(paths) {
      await removeMediaObjects(db, paths)
    },
    async deleteFaceRows(mediaIds) {
      if (mediaIds.length === 0) return
      const { error } = await db.from('media_faces').delete().in('media_id', mediaIds)
      check(error)
    },
    async markMediaDeleted(ids) {
      if (ids.length === 0) return
      const { error } = await db.from('media').update({ deleted_at: new Date().toISOString() }).in('id', ids)
      check(error)
    },
    async listExpiredEventIds(today) {
      const { data, error } = await db.from('events').select('id').eq('status', 'active').lt('expires_at', today)
      check(error)
      return (data ?? []).map(row => row.id as string)
    },
    async markEventExpired(eventId) {
      const { error } = await db.from('events').update({ status: 'expired' }).eq('id', eventId)
      check(error)
    },
  }
}
