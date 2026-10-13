import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { MEDIA_BUCKET } from './paths'
import type { MediaProcessingRepo, ProcessingMedia } from './processing'

function check(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

export async function removeMediaObjects(db: SupabaseClient, paths: string[]): Promise<void> {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await db.storage.from(MEDIA_BUCKET).remove(paths.slice(i, i + 100))
    check(error)
  }
}

export function createSupabaseProcessingRepo(db: SupabaseClient): MediaProcessingRepo {
  return {
    async getMedia(id) {
      const { data, error } = await db
        .from('media')
        .select('id, event_id, type, storage_path, frame_count, face_indexing, status, attempts, deleted_at')
        .eq('id', id)
        .maybeSingle()
      check(error)
      if (!data) return null
      const { deleted_at: deletedAt, ...rest } = data
      return { ...rest, deleted: deletedAt !== null } as ProcessingMedia
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
    async download(path) {
      const { data, error } = await db.storage.from(MEDIA_BUCKET).download(path)
      if (error || !data) throw new Error(`Arquivo não encontrado: ${path}`)
      return new Uint8Array(await data.arrayBuffer())
    },
    async removeObjects(paths) {
      await removeMediaObjects(db, paths)
    },
    async saveFaces(mediaId, eventId, faceIds) {
      if (faceIds.length === 0) return
      const { error } = await db
        .from('media_faces')
        .upsert(faceIds.map(faceId => ({ face_id: faceId, media_id: mediaId, event_id: eventId })))
      check(error)
    },
    async markStatus(id, patch) {
      const { error } = await db.from('media').update(patch).eq('id', id)
      check(error)
    },
    async listRetryable(createdBefore, maxAttempts, limit) {
      const { data, error } = await db
        .from('media')
        .select('id')
        .in('status', ['uploading', 'processing', 'error'])
        .lt('attempts', maxAttempts)
        .lt('created_at', createdBefore)
        .is('deleted_at', null)
        .order('created_at')
        .limit(limit)
      check(error)
      return (data ?? []).map(row => row.id as string)
    },
  }
}
