import { describe, expect, it } from 'vitest'
import { isCronAuthorized } from '@/lib/cron'

describe('isCronAuthorized', () => {
  const secret = 'abcdefghijklmnop'

  it('accepts the bearer secret', () => {
    expect(isCronAuthorized(`Bearer ${secret}`, secret)).toBe(true)
  })

  it('rejects anything else', () => {
    expect(isCronAuthorized('Bearer wrong', secret)).toBe(false)
    expect(isCronAuthorized(null, secret)).toBe(false)
    expect(isCronAuthorized('Bearer short', 'short')).toBe(false)
    expect(isCronAuthorized('Bearer x', undefined)).toBe(false)
  })
})
