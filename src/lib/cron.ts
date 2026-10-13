import { timingSafeEqual } from 'node:crypto'

export function isCronAuthorized(authHeader: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 16 || !authHeader) return false
  const given = Buffer.from(authHeader)
  const expected = Buffer.from(`Bearer ${secret}`)
  return given.length === expected.length && timingSafeEqual(given, expected)
}
