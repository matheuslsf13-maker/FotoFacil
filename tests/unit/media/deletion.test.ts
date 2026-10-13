import { describe, expect, it, vi } from 'vitest'
import type { FaceProvider } from '@/lib/faces/provider'
import { deleteMedia, expireEvents, type DeletableMedia, type MediaDeletionRepo } from '@/lib/media/deletion'

class FakeRepo implements MediaDeletionRepo {
  media = new Map<string, DeletableMedia>()
  faces: Array<{ face_id: string; media_id: string; event_id: string }> = []
  collections = new Map<string, string | null>()
  deleted = new Set<string>()
  removed: string[] = []
  expiredEvents: string[] = []
  activeEventsPastExpiry: string[] = []

  async getLiveMedia(ids: string[]) {
    return ids.flatMap(id => (this.media.has(id) && !this.deleted.has(id) ? [this.media.get(id)!] : []))
  }
  async listLiveMediaIds(eventId: string) {
    return [...this.media.values()].filter(m => m.event_id === eventId && !this.deleted.has(m.id)).map(m => m.id)
  }
  async getFaces(mediaIds: string[]) {
    return this.faces.filter(f => mediaIds.includes(f.media_id)).map(({ face_id, event_id }) => ({ face_id, event_id }))
  }
  async getEventCollection(eventId: string) {
    return this.collections.get(eventId) ?? null
  }
  async setEventCollection(eventId: string, collectionId: string | null) {
    this.collections.set(eventId, collectionId)
  }
  async removeObjects(paths: string[]) {
    this.removed.push(...paths)
  }
  async deleteFaceRows(mediaIds: string[]) {
    this.faces = this.faces.filter(f => !mediaIds.includes(f.media_id))
  }
  async markMediaDeleted(ids: string[]) {
    ids.forEach(id => this.deleted.add(id))
  }
  async listExpiredEventIds() {
    return this.activeEventsPastExpiry
  }
  async markEventExpired(eventId: string) {
    this.expiredEvents.push(eventId)
  }
}

function fakeFaces() {
  return {
    ensureCollection: vi.fn(async () => {}),
    indexFaces: vi.fn(async () => []),
    countFaces: vi.fn(async () => 1),
    searchFaces: vi.fn(async () => []),
    deleteFaces: vi.fn(async () => {}),
    deleteCollection: vi.fn(async () => {}),
  } satisfies FaceProvider
}

function seed(repo: FakeRepo) {
  repo.collections.set('e1', 'fotofacil-e1')
  repo.media.set('p1', { id: 'p1', event_id: 'e1', type: 'photo', storage_path: 'events/e1/p1/full.jpg', thumb_path: 'events/e1/p1/thumb.jpg', frame_count: 0 })
  repo.media.set('v1', { id: 'v1', event_id: 'e1', type: 'video', storage_path: 'events/e1/v1/video.mp4', thumb_path: 'events/e1/v1/poster.jpg', frame_count: 1 })
  repo.faces.push({ face_id: 'f1', media_id: 'p1', event_id: 'e1' }, { face_id: 'f2', media_id: 'v1', event_id: 'e1' })
}

describe('deleteMedia', () => {
  it('removes faces, files (including leftover frames) and marks media deleted', async () => {
    const repo = new FakeRepo()
    const faces = fakeFaces()
    seed(repo)
    expect(await deleteMedia(['p1', 'v1', 'unknown'], { repo, faces })).toBe(2)
    expect(faces.deleteFaces).toHaveBeenCalledWith('fotofacil-e1', ['f1', 'f2'])
    expect(repo.removed).toEqual([
      'events/e1/p1/full.jpg',
      'events/e1/p1/thumb.jpg',
      'events/e1/v1/video.mp4',
      'events/e1/v1/poster.jpg',
      'events/e1/v1/frames/0001.jpg',
    ])
    expect([...repo.deleted]).toEqual(['p1', 'v1'])
    expect(repo.faces).toEqual([])
  })

  it('does nothing for an empty or already deleted selection', async () => {
    const repo = new FakeRepo()
    const faces = fakeFaces()
    expect(await deleteMedia([], { repo, faces })).toBe(0)
    expect(faces.deleteFaces).not.toHaveBeenCalled()
  })
})

describe('expireEvents', () => {
  it('deletes files, drops the face collection and marks each expired event', async () => {
    const repo = new FakeRepo()
    const faces = fakeFaces()
    seed(repo)
    repo.activeEventsPastExpiry = ['e1']
    expect(await expireEvents('2026-10-13', { repo, faces })).toBe(1)
    expect(faces.deleteCollection).toHaveBeenCalledWith('fotofacil-e1')
    expect(faces.deleteFaces).not.toHaveBeenCalled()
    expect(repo.deleted.size).toBe(2)
    expect(repo.collections.get('e1')).toBeNull()
    expect(repo.expiredEvents).toEqual(['e1'])
  })
})
