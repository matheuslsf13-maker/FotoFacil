import { startOfTodaySaoPauloISO, todayInSaoPaulo } from '@/lib/domain/dates'
import { isEventAvailable } from '@/lib/domain/events'
import type { FaceProvider } from '@/lib/faces/provider'

export type SearchFailure =
  | 'not_found'
  | 'not_paid'
  | 'event_unavailable'
  | 'no_consent'
  | 'limit'
  | 'not_ready'
  | 'no_face'
  | 'many_faces'

export type SearchOutcome = { ok: true; matchCount: number } | { ok: false; reason: SearchFailure }

export interface SearchRegistration {
  id: string
  event_id: string
  status: 'wristband' | 'paid'
  face_consent_at: string | null
}

export interface SearchRepo {
  getRegistration(id: string): Promise<SearchRegistration | null>
  getEvent(eventId: string): Promise<{ status: string; expires_at: string; rekognition_collection_id: string | null } | null>
  getSearchSettings(): Promise<{ faceMatchThreshold: number; dailySearchLimit: number }>
  countSearchesSince(registrationId: string, sinceIso: string): Promise<number>
  logSearch(registrationId: string): Promise<void>
  setConsent(registrationId: string): Promise<void>
  filterLiveMedia(eventId: string, mediaIds: string[]): Promise<string[]>
  recordMatches(registrationId: string, mediaIds: string[]): Promise<void>
}

export interface SearchInput {
  registrationId: string
  selfie: Uint8Array
  consent: boolean
  now: Date
}

function fail(reason: SearchFailure): SearchOutcome {
  return { ok: false, reason }
}

export async function searchClientMedia(input: SearchInput, deps: { repo: SearchRepo; faces: FaceProvider }): Promise<SearchOutcome> {
  const { repo, faces } = deps
  const registration = await repo.getRegistration(input.registrationId)
  if (!registration) return fail('not_found')
  if (registration.status !== 'paid') return fail('not_paid')
  const event = await repo.getEvent(registration.event_id)
  if (!event || !isEventAvailable(event, todayInSaoPaulo(input.now))) return fail('event_unavailable')
  if (!registration.face_consent_at) {
    if (!input.consent) return fail('no_consent')
    await repo.setConsent(registration.id)
  }
  const settings = await repo.getSearchSettings()
  const searchesToday = await repo.countSearchesSince(registration.id, startOfTodaySaoPauloISO(input.now))
  if (searchesToday >= settings.dailySearchLimit) return fail('limit')
  if (!event.rekognition_collection_id) return fail('not_ready')

  await repo.logSearch(registration.id)
  const faceCount = await faces.countFaces(input.selfie)
  if (faceCount === 0) return fail('no_face')
  if (faceCount > 1) return fail('many_faces')

  const matches = await faces.searchFaces(event.rekognition_collection_id, input.selfie, settings.faceMatchThreshold)
  const candidateIds = [...new Set(matches.map(match => match.externalImageId))]
  const mediaIds = await repo.filterLiveMedia(registration.event_id, candidateIds)
  await repo.recordMatches(registration.id, mediaIds)
  return { ok: true, matchCount: mediaIds.length }
}
