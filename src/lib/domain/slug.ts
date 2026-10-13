const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

function randomSuffix(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4))
  return Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join('')
}

export function eventSlug(name: string, suffix: string = randomSuffix()): string {
  return `${slugify(name) || 'evento'}-${suffix}`
}
