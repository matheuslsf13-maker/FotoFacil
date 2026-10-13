import { createHmac, timingSafeEqual } from 'node:crypto'

export interface ClientSessionPayload {
  rid: string
  exp: number
}

export const CLIENT_SESSION_DAYS = 30

function sign(body: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(body).digest()
}

export function signClientSession(payload: ClientSessionPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${sign(body, secret).toString('base64url')}`
}

export function verifyClientSession(
  token: string | undefined,
  secret: string,
  nowS: number = Math.floor(Date.now() / 1000),
): ClientSessionPayload | null {
  if (!token) return null
  const [body, signature] = token.split('.')
  if (!body || !signature) return null
  const expected = sign(body, secret)
  const given = Buffer.from(signature, 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as ClientSessionPayload
    if (typeof payload.rid !== 'string' || typeof payload.exp !== 'number' || payload.exp < nowS) return null
    return payload
  } catch {
    return null
  }
}
