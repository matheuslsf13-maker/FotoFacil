export type ClientView = 'payment' | 'search' | 'gallery'

export function clientView(input: { status: 'wristband' | 'paid'; lastSearchAt: string | null; forceSearch: boolean }): ClientView {
  if (input.status !== 'paid') return 'payment'
  if (!input.lastSearchAt || input.forceSearch) return 'search'
  return 'gallery'
}

export function hasNewMedia(lastSearchAt: string | null, latestMediaAt: string | null): boolean {
  if (!lastSearchAt || !latestMediaAt) return false
  return Date.parse(latestMediaAt) > Date.parse(lastSearchAt)
}
