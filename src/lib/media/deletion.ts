import type { FaceProvider } from '@/lib/faces/provider'
import { framePaths, type MediaType } from './paths'

export interface DeletableMedia {
  id: string
  event_id: string
  type: MediaType
  storage_path: string
  thumb_path: string
  frame_count: number
}

export interface MediaDeletionRepo {
  getLiveMedia(ids: string[]): Promise<DeletableMedia[]>
  listLiveMediaIds(eventId: string): Promise<string[]>
  getFaces(mediaIds: string[]): Promise<Array<{ face_id: string; event_id: string }>>
  getEventCollection(eventId: string): Promise<string | null>
  setEventCollection(eventId: string, collectionId: string | null): Promise<void>
  removeObjects(paths: string[]): Promise<void>
  deleteFaceRows(mediaIds: string[]): Promise<void>
  markMediaDeleted(ids: string[]): Promise<void>
  listExpiredEventIds(today: string): Promise<string[]>
  markEventExpired(eventId: string): Promise<void>
}

export interface DeletionDeps {
  repo: MediaDeletionRepo
  faces: FaceProvider
}

const CHUNK = 200

function storagePaths(items: DeletableMedia[]): string[] {
  return items.flatMap(item => [
    item.storage_path,
    item.thumb_path,
    ...(item.type === 'video' ? framePaths(item.event_id, item.id, item.frame_count) : []),
  ])
}

export async function deleteMedia(ids: string[], { repo, faces }: DeletionDeps): Promise<number> {
  let deleted = 0
  for (let i = 0; i < ids.length; i += CHUNK) {
    const items = await repo.getLiveMedia(ids.slice(i, i + CHUNK))
    if (items.length === 0) continue
    const itemIds = items.map(item => item.id)
    const faceRows = await repo.getFaces(itemIds)
    const byEvent = new Map<string, string[]>()
    for (const row of faceRows) byEvent.set(row.event_id, [...(byEvent.get(row.event_id) ?? []), row.face_id])
    for (const [eventId, faceIds] of byEvent) {
      const collectionId = await repo.getEventCollection(eventId)
      if (collectionId) await faces.deleteFaces(collectionId, faceIds)
    }
    await repo.removeObjects(storagePaths(items))
    await repo.deleteFaceRows(itemIds)
    await repo.markMediaDeleted(itemIds)
    deleted += items.length
  }
  return deleted
}

export async function expireEvent(eventId: string, { repo, faces }: DeletionDeps): Promise<void> {
  const ids = await repo.listLiveMediaIds(eventId)
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    const items = await repo.getLiveMedia(chunk)
    await repo.removeObjects(storagePaths(items))
    await repo.deleteFaceRows(chunk)
    await repo.markMediaDeleted(chunk)
  }
  const collectionId = await repo.getEventCollection(eventId)
  if (collectionId) await faces.deleteCollection(collectionId)
  await repo.setEventCollection(eventId, null)
  await repo.markEventExpired(eventId)
}

export async function expireEvents(today: string, deps: DeletionDeps): Promise<number> {
  const eventIds = await deps.repo.listExpiredEventIds(today)
  for (const eventId of eventIds) await expireEvent(eventId, deps)
  return eventIds.length
}
