import { describe, expect, it } from 'vitest'
import { signClientSession, verifyClientSession } from '@/lib/client-session/token'

const secret = 'x'.repeat(32)

describe('client session token', () => {
  it('round-trips a valid token', () => {
    const token = signClientSession({ rid: 'reg-1', exp: 2_000 }, secret)
    expect(verifyClientSession(token, secret, 1_000)).toEqual({ rid: 'reg-1', exp: 2_000 })
  })

  it('rejects expired, tampered or foreign tokens', () => {
    const token = signClientSession({ rid: 'reg-1', exp: 2_000 }, secret)
    expect(verifyClientSession(token, secret, 3_000)).toBeNull()
    const [body, sig] = token.split('.')
    const forged = Buffer.from(JSON.stringify({ rid: 'reg-2', exp: 2_000 })).toString('base64url')
    expect(verifyClientSession(`${forged}.${sig}`, secret, 1_000)).toBeNull()
    expect(verifyClientSession(`${body}.${sig}`, 'y'.repeat(32), 1_000)).toBeNull()
    expect(verifyClientSession(undefined, secret, 1_000)).toBeNull()
    expect(verifyClientSession('garbage', secret, 1_000)).toBeNull()
  })
})
