/**
 * Without generated Database types, supabase-js types many-to-one embeds
 * (e.g. `events(name)` from registrations) as arrays, while PostgREST returns
 * a single object. `one` reads either shape.
 */
export function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}
