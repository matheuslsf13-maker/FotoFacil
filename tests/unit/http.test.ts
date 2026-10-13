import { describe, expect, it } from 'vitest'
import { clientIp } from '@/lib/http'

describe('clientIp', () => {
  it('takes the first forwarded address', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '200.1.2.3, 10.0.0.1' }))).toBe('200.1.2.3')
    expect(clientIp(new Headers({ 'x-real-ip': '200.1.2.4' }))).toBe('200.1.2.4')
    expect(clientIp(new Headers())).toBe('unknown')
  })
})
