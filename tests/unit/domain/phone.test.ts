import { describe, expect, it } from 'vitest'
import { maskPhone, normalizePhone, phoneLast4 } from '@/lib/domain/phone'

describe('normalizePhone', () => {
  it.each(['71 99123-4567', '(71)991234567', '+55 71 9 9123 4567', '071991234567', '5571991234567'])(
    'normalizes %s to E.164',
    input => {
      expect(normalizePhone(input)).toBe('+5571991234567')
    },
  )

  it('rejects invalid numbers', () => {
    expect(normalizePhone('123')).toBeNull()
    expect(normalizePhone('')).toBeNull()
    expect(normalizePhone('abc')).toBeNull()
  })
})

describe('maskPhone', () => {
  it('masks Brazilian numbers keeping DDD, first digit and last 4', () => {
    expect(maskPhone('+5571991234567')).toBe('(71) 9****-4567')
  })

  it('masks foreign numbers keeping country code and last 4', () => {
    expect(maskPhone('+14155552671')).toBe('+14 ****-2671')
  })
})

describe('phoneLast4', () => {
  it('returns the last four digits', () => {
    expect(phoneLast4('+5571991234567')).toBe('4567')
  })
})
