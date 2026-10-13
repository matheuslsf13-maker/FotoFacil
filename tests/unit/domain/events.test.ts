import { describe, expect, it } from 'vitest'
import { eventDays, expiryWarning, isEventAvailable } from '@/lib/domain/events'

describe('isEventAvailable', () => {
  it('is available while active and not past expires_at', () => {
    expect(isEventAvailable({ status: 'active', expires_at: '2026-10-13' }, '2026-10-13')).toBe(true)
    expect(isEventAvailable({ status: 'active', expires_at: '2026-10-12' }, '2026-10-13')).toBe(false)
    expect(isEventAvailable({ status: 'expired', expires_at: '2026-12-01' }, '2026-10-13')).toBe(false)
  })
})

describe('eventDays', () => {
  it('lists every day of the event', () => {
    expect(eventDays('2026-10-30', '2026-11-01')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01'])
  })
})

describe('expiryWarning', () => {
  it('warns only in the last 3 days', () => {
    expect(expiryWarning({ status: 'active', expires_at: '2026-10-20' }, '2026-10-13')).toBeNull()
    expect(expiryWarning({ status: 'active', expires_at: '2026-10-16' }, '2026-10-13')).toBe(
      'As fotos deste evento serão excluídas em 3 dias.',
    )
    expect(expiryWarning({ status: 'active', expires_at: '2026-10-14' }, '2026-10-13')).toBe(
      'As fotos deste evento serão excluídas em 1 dia.',
    )
    expect(expiryWarning({ status: 'active', expires_at: '2026-10-13' }, '2026-10-13')).toBe(
      'Hoje é o último dia: as fotos deste evento serão excluídas nesta madrugada.',
    )
    expect(expiryWarning({ status: 'expired', expires_at: '2026-10-13' }, '2026-10-13')).toBeNull()
  })
})
