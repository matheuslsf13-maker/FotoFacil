import { describe, expect, it } from 'vitest'
import { isAccessBlocked } from '@/lib/domain/access'

describe('isAccessBlocked', () => {
  it('blocks after 5 failures for the registration or the IP', () => {
    expect(isAccessBlocked(4, 4)).toBe(false)
    expect(isAccessBlocked(5, 0)).toBe(true)
    expect(isAccessBlocked(0, 5)).toBe(true)
  })
})
