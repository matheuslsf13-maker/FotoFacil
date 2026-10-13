import { describe, expect, it, vi } from 'vitest'
import type { FaceProvider } from '@/lib/faces/provider'
import { searchClientMedia, type SearchRegistration, type SearchRepo } from '@/lib/search/search'

const NOW = new Date('2026-10-13T15:00:00Z')

class FakeRepo implements SearchRepo {
  registration: SearchRegistration | null = { id: 'r1', event_id: 'e1', status: 'paid', face_consent_at: null }
  event: { status: string; expires_at: string; rekognition_collection_id: string | null } | null = {
    status: 'active',
    expires_at: '2026-11-01',
    rekognition_collection_id: 'fotofacil-e1',
  }
  searchesToday = 0
  live = new Set(['m1', 'm2'])
  consentSet = false
  logged = 0
  recorded: string[] | null = null

  async getRegistration() {
    return this.registration
  }
  async getEvent() {
    return this.event
  }
  async getSearchSettings() {
    return { faceMatchThreshold: 90, dailySearchLimit: 10 }
  }
  async countSearchesSince() {
    return this.searchesToday
  }
  async logSearch() {
    this.logged += 1
  }
  async setConsent() {
    this.consentSet = true
  }
  async filterLiveMedia(_eventId: string, ids: string[]) {
    return ids.filter(id => this.live.has(id))
  }
  async recordMatches(_registrationId: string, mediaIds: string[]) {
    this.recorded = mediaIds
  }
}

function faces(count = 1, matches = [{ faceId: 'f1', externalImageId: 'm1' }, { faceId: 'f2', externalImageId: 'm1' }, { faceId: 'f3', externalImageId: 'gone' }]) {
  return {
    ensureCollection: vi.fn(async () => {}),
    indexFaces: vi.fn(async () => []),
    countFaces: vi.fn(async () => count),
    searchFaces: vi.fn(async () => matches),
    deleteFaces: vi.fn(async () => {}),
    deleteCollection: vi.fn(async () => {}),
  } satisfies FaceProvider
}

const input = { registrationId: 'r1', selfie: new Uint8Array([1]), consent: true, now: NOW }

describe('searchClientMedia', () => {
  it('records consent, searches the event collection and stores unique live matches', async () => {
    const repo = new FakeRepo()
    const provider = faces()
    expect(await searchClientMedia(input, { repo, faces: provider })).toEqual({ ok: true, matchCount: 1 })
    expect(repo.consentSet).toBe(true)
    expect(repo.logged).toBe(1)
    expect(provider.searchFaces).toHaveBeenCalledWith('fotofacil-e1', input.selfie, 90)
    expect(repo.recorded).toEqual(['m1'])
  })

  it('refuses unpaid registrations without calling the provider', async () => {
    const repo = new FakeRepo()
    repo.registration = { ...repo.registration!, status: 'wristband' }
    const provider = faces()
    expect(await searchClientMedia(input, { repo, faces: provider })).toEqual({ ok: false, reason: 'not_paid' })
    expect(provider.countFaces).not.toHaveBeenCalled()
  })

  it('requires consent the first time', async () => {
    const repo = new FakeRepo()
    expect(await searchClientMedia({ ...input, consent: false }, { repo, faces: faces() })).toEqual({ ok: false, reason: 'no_consent' })
  })

  it('enforces the daily limit', async () => {
    const repo = new FakeRepo()
    repo.searchesToday = 10
    expect(await searchClientMedia(input, { repo, faces: faces() })).toEqual({ ok: false, reason: 'limit' })
  })

  it('reports an event without indexed photos as not ready and records nothing', async () => {
    const repo = new FakeRepo()
    repo.event = { ...repo.event!, rekognition_collection_id: null }
    expect(await searchClientMedia(input, { repo, faces: faces() })).toEqual({ ok: false, reason: 'not_ready' })
    expect(repo.recorded).toBeNull()
  })

  it('rejects selfies with no face or several faces without recording matches', async () => {
    const repo = new FakeRepo()
    expect(await searchClientMedia(input, { repo, faces: faces(0) })).toEqual({ ok: false, reason: 'no_face' })
    expect(await searchClientMedia(input, { repo, faces: faces(2) })).toEqual({ ok: false, reason: 'many_faces' })
    expect(repo.recorded).toBeNull()
  })

  it('refuses expired events', async () => {
    const repo = new FakeRepo()
    repo.event = { ...repo.event!, expires_at: '2026-10-12' }
    expect(await searchClientMedia(input, { repo, faces: faces() })).toEqual({ ok: false, reason: 'event_unavailable' })
  })

  it('records an empty result when nobody matches', async () => {
    const repo = new FakeRepo()
    expect(await searchClientMedia(input, { repo, faces: faces(1, []) })).toEqual({ ok: true, matchCount: 0 })
    expect(repo.recorded).toEqual([])
  })
})
