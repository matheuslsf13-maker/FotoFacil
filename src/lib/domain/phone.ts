import { parsePhoneNumberFromString } from 'libphonenumber-js'

export function normalizePhone(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  let candidate = trimmed.replace(/^0+(?=\d)/, '')
  const digits = candidate.replace(/\D/g, '')
  if (!candidate.startsWith('+') && digits.startsWith('55') && digits.length >= 12) candidate = `+${digits}`
  const parsed = parsePhoneNumberFromString(candidate, 'BR')
  if (!parsed || !parsed.isValid()) return null
  return parsed.number
}

export function maskPhone(e164: string): string {
  const last4 = e164.slice(-4)
  if (e164.startsWith('+55') && e164.length >= 12) {
    return `(${e164.slice(3, 5)}) ${e164.slice(5, 6)}****-${last4}`
  }
  return `${e164.slice(0, 3)} ****-${last4}`
}

export function phoneLast4(e164: string): string {
  return e164.slice(-4)
}
