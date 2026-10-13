import { describe, expect, it } from 'vitest'
import {
  addDays,
  daysUntil,
  formatDate,
  formatDayMonth,
  localDateOf,
  startOfTodaySaoPauloISO,
  todayInSaoPaulo,
} from '@/lib/domain/dates'

describe('dates', () => {
  it('computes today in São Paulo (UTC-3)', () => {
    expect(todayInSaoPaulo(new Date('2026-10-13T02:30:00Z'))).toBe('2026-10-12')
    expect(todayInSaoPaulo(new Date('2026-10-13T03:30:00Z'))).toBe('2026-10-13')
  })

  it('gives the start of the São Paulo day as ISO', () => {
    expect(startOfTodaySaoPauloISO(new Date('2026-10-13T02:30:00Z'))).toBe('2026-10-12T00:00:00-03:00')
  })

  it('formats dates', () => {
    expect(formatDayMonth('2026-10-05')).toBe('05/10')
    expect(formatDate('2026-10-05')).toBe('05/10/2026')
  })

  it('adds days across months', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02')
  })

  it('counts days between dates', () => {
    expect(daysUntil('2026-10-13', '2026-10-16')).toBe(3)
    expect(daysUntil('2026-10-13', '2026-10-13')).toBe(0)
  })

  it('reads the local calendar date of a Date', () => {
    expect(localDateOf(new Date(2026, 9, 12, 23, 30))).toBe('2026-10-12')
  })
})
