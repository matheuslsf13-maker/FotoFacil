import { describe, expect, it, vi } from 'vitest'
import type { FaceProvider } from '@/lib/faces/provider'
import {
  processMedia,
  retryStuckMedia,
  type MediaProcessingRepo,
  type MediaStatus,
  type ProcessingMedia,
} from '@/lib/media/processing'

class FakeRepo implements MediaProcessingRepo {
  media = new Map<string, ProcessingMedia>()
  collections = new Map<string, string>()
  objects = new Map<string, Uint8Array>()
  faces: Array<{ mediaId: string; faceId: string }> = []
  removed: string[] = []
  statuses: Array<{ id: string; status: MediaStatus; attempts: number; error_msg: string | null }> = []

  async getMedia(id: string) {
    return this.media.get(id) ?? null
  }
  async getEventCollection(eventId: string) {
    return this.collections.get(eventId) ?? null
  }
  async setEventCollection(eventId: string, collectionId: string) {
    this.collections.set(eventId, collectionId)
  }
  async download(path: string) {
    const bytes = this.objects.get(path)
    if (!bytes) throw new Error(`missing ${path}`)
    return bytes
  }
  async removeObjects(paths: string[]) {
    this.removed.push(...paths)
  }
  async saveFaces(mediaId: string, _eventId: string, faceIds: string[]) {
    for (const faceId of faceIds) this.faces.push({ mediaId, faceId })
  }
  async markStatus(id: string, patch: { status: MediaStatus; attempts: number; error_msg: string | null }) {
    this.statuses.push({ id, ...patch })
    const current = this.media.get(id)
    if (current) this.media.set(id, { ...current, status: patch.status, attempts: patch.attempts })
  }
  async listRetryable() {
    return [...this.media.values()].filter(m => m.status !== 'ready').map(m => m.id)
  }
}

function fakeFaces() {
  let n = 0
  return {
    ensureCollection: vi.fn(async () => {}),
    indexFaces: vi.fn(async () => [`face-${++n}`]),
    countFaces: vi.fn(async () => 1),
    searchFaces: vi.fn(async () => []),
    deleteFaces: vi.fn(async () => {}),
    deleteCollection: vi.fn(async () => {}),
  } satisfies FaceProvider
}

function photo(overrides: Partial<ProcessingMedia> = {}): ProcessingMedia {
  return {
    id: 'm1',
    event_id: 'e1',
    type: 'photo',
    storage_path: 'events/e1/m1/full.jpg',
    frame_count: 0,
    face_indexing: 'enabled',
    status: 'uploading',
    attempts: 0,
    deleted: false,
    ...overrides,
  }
}

describe('processMedia', () => {
  it('creates the event collection once, indexes the photo and marks it ready', async () => {
    const repo = new FakeRepo()
    const faces = fakeFaces()
    repo.media.set('m1', photo())
    repo.objects.set('events/e1/m1/full.jpg', new Uint8Array([1]))
    expect(await processMedia('m1', { repo, faces })).toBe('ready')
    expect(faces.ensureCollection).toHaveBeenCalledWith('fotofacil-e1')
    expect(faces.indexFaces).toHaveBeenCalledWith('fotofacil-e1', new Uint8Array([1]), 'm1')
    expect(repo.collections.get('e1')).toBe('fotofacil-e1')
    expect(repo.faces).toEqual([{ mediaId: 'm1', faceId: 'face-1' }])
    expect(repo.statuses.at(-1)).toEqual({ id: 'm1', status: 'ready', attempts: 1, error_msg: null })
  })

  it('reuses an existing collection', async () => {
    const repo = new FakeRepo()
    const faces = fakeFaces()
    repo.collections.set('e1', 'fotofacil-e1')
    repo.media.set('m1', photo())
    repo.objects.set('events/e1/m1/full.jpg', new Uint8Array([1]))
    await processMedia('m1', { repo, faces })
    expect(faces.ensureCollection).not.toHaveBeenCalled()
  })

  it('indexes every video frame and removes the frames afterwards', async () => {
    const repo = new FakeRepo()
    const faces = fakeFaces()
    repo.media.set('v1', photo({ id: 'v1', type: 'video', storage_path: 'events/e1/v1/video.mp4', frame_count: 2 }))
    repo.objects.set('events/e1/v1/frames/0001.jpg', new Uint8Array([1]))
    repo.objects.set('events/e1/v1/frames/0002.jpg', new Uint8Array([2]))
    expect(await processMedia('v1', { repo, faces })).toBe('ready')
    expect(repo.faces.map(f => f.faceId)).toEqual(['face-1', 'face-2'])
    expect(repo.removed).toEqual(['events/e1/v1/frames/0001.jpg', 'events/e1/v1/frames/0002.jpg'])
  })

  it('marks an undecodable video ready without indexing', async () => {
    const repo = new FakeRepo()
    const faces = fakeFaces()
    repo.media.set('v1', photo({ id: 'v1', type: 'video', face_indexing: 'unsupported', frame_count: 0 }))
    expect(await processMedia('v1', { repo, faces })).toBe('ready')
    expect(faces.indexFaces).not.toHaveBeenCalled()
  })

  it('records the error and the attempt when indexing fails', async () => {
    const repo = new FakeRepo()
    const faces = fakeFaces()
    faces.indexFaces.mockRejectedValueOnce(new Error('aws down'))
    repo.media.set('m1', photo({ attempts: 1, status: 'error' }))
    repo.objects.set('events/e1/m1/full.jpg', new Uint8Array([1]))
    expect(await processMedia('m1', { repo, faces })).toBe('error')
    expect(repo.statuses.at(-1)).toEqual({ id: 'm1', status: 'error', attempts: 2, error_msg: 'aws down' })
  })

  it('skips media that is ready or deleted', async () => {
    const repo = new FakeRepo()
    const faces = fakeFaces()
    repo.media.set('m1', photo({ status: 'ready' }))
    repo.media.set('m2', photo({ id: 'm2', deleted: true }))
    expect(await processMedia('m1', { repo, faces })).toBe('skipped')
    expect(await processMedia('m2', { repo, faces })).toBe('skipped')
    expect(await processMedia('missing', { repo, faces })).toBe('skipped')
  })
})

describe('retryStuckMedia', () => {
  it('reprocesses what the repo reports as retryable', async () => {
    const repo = new FakeRepo()
    const faces = fakeFaces()
    repo.media.set('m1', photo({ status: 'error', attempts: 1 }))
    repo.objects.set('events/e1/m1/full.jpg', new Uint8Array([1]))
    expect(await retryStuckMedia(new Date(), { repo, faces })).toBe(1)
    expect(repo.media.get('m1')?.status).toBe('ready')
  })
})
