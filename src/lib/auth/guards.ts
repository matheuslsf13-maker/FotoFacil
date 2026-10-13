import 'server-only'
import { redirect } from 'next/navigation'
import { getSessionProfile, type SessionProfile } from './session'

export async function requireAdmin(): Promise<SessionProfile> {
  const session = await getSessionProfile()
  if (!session || session.role !== 'admin') redirect('/login')
  return session
}

export async function requirePhotographer(): Promise<SessionProfile & { photographerId: string }> {
  const session = await getSessionProfile()
  if (!session || session.role !== 'photographer' || !session.photographerId) redirect('/login')
  return { ...session, photographerId: session.photographerId }
}
