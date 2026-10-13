import { mapLimit } from '@/lib/async'
import { collectionIdFor, type FaceProvider } from '@/lib/faces/provider'
import { framePaths, type MediaType } from './paths'

export type MediaStatus = 'uploading' | 'processing' | 'ready' | 'error'
export const MAX_ATTEMPTS = 3
export const RETRY_AFTER_MS = 10 * 60_000

export interface ProcessingMedia {
  id: string
  event_id: string
  type: MediaType
  storage_path: string
  frame_count: number
  face_indexing: 'enabled' | 'unsupported'
  status: MediaStatus
  attempts: number
  deleted: boolean
}

export interface MediaProcessingRepo {
  getMedia(id: string): Promise<ProcessingMedia | null>
  getEventCollection(eventId: string): Promise<string | null>
  setEventCollection(eventId: string, collectionId: string): Promise<void>
  download(path: string): Promise<Uint8Array>
  removeObjects(paths: string[]): Promise<void>
  saveFaces(mediaId: string, eventId: string, faceIds: string[]): Promise<void>
  markStatus(id: string, patch: { status: MediaStatus; attempts: number; error_msg: string | null }): Promise<void>
  listRetryable(createdBefore: string, maxAttempts: number, limit: number): Promise<string[]>
}

export interface ProcessingDeps {
  repo: MediaProcessingRepo
  faces: FaceProvider
}

export type ProcessResult = 'ready' | 'error' | 'skipped'

export async function ensureEventCollection(eventId: string, { repo, faces }: ProcessingDeps): Promise<string> {
  const existing = await repo.getEventCollection(eventId)
  if (existing) return existing
  const collectionId = collectionIdFor(eventId)
  await faces.ensureCollection(collectionId)
  await repo.setEventCollection(eventId, collectionId)
  return collectionId
}

export async function processMedia(mediaId: string, deps: ProcessingDeps): Promise<ProcessResult> {
  const { repo, faces } = deps
  const media = await repo.getMedia(mediaId)
  if (!media || media.deleted || media.status === 'ready') return 'skipped'
  const attempts = media.attempts + 1
  try {
    if (media.face_indexing === 'enabled') {
      const collectionId = await ensureEventCollection(media.event_id, deps)
      const sources =
        media.type === 'photo' ? [media.storage_path] : framePaths(media.event_id, media.id, media.frame_count)
      const faceIds = await mapLimit(sources, 6, async path => faces.indexFaces(collectionId, await repo.download(path), media.id))
      await repo.saveFaces(media.id, media.event_id, faceIds.flat())
      if (media.type === 'video' && sources.length > 0) await repo.removeObjects(sources)
    }
    await repo.markStatus(media.id, { status: 'ready', attempts, error_msg: null })
    return 'ready'
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : 'erro desconhecido'
    await repo.markStatus(media.id, { status: 'error', attempts, error_msg: message })
    return 'error'
  }
}

export async function retryStuckMedia(now: Date, deps: ProcessingDeps, limit = 10): Promise<number> {
  const createdBefore = new Date(now.getTime() - RETRY_AFTER_MS).toISOString()
  const ids = await deps.repo.listRetryable(createdBefore, MAX_ATTEMPTS, limit)
  for (const id of ids) await processMedia(id, deps)
  return ids.length
}
