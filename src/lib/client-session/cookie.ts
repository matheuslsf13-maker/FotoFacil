import 'server-only'
import { cookies } from 'next/headers'
import { CLIENT_SESSION_DAYS, signClientSession, verifyClientSession } from './token'

function secret(): string {
  const value = process.env.CLIENT_SESSION_SECRET
  if (!value || value.length < 32) throw new Error('CLIENT_SESSION_SECRET must have at least 32 characters')
  return value
}

function cookieName(eventId: string): string {
  return `ff_${eventId.replace(/-/g, '')}`
}

export async function setClientSession(eventId: string, registrationId: string): Promise<void> {
  const maxAge = CLIENT_SESSION_DAYS * 86_400
  const token = signClientSession({ rid: registrationId, exp: Math.floor(Date.now() / 1000) + maxAge }, secret())
  ;(await cookies()).set(cookieName(eventId), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  })
}

export async function getClientRegistrationId(eventId: string): Promise<string | null> {
  const token = (await cookies()).get(cookieName(eventId))?.value
  return verifyClientSession(token, secret())?.rid ?? null
}
