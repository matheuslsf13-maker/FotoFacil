export const ACCESS_WINDOW_MS = 15 * 60_000
export const MAX_FAILED_ATTEMPTS = 5

export function isAccessBlocked(failuresForRegistration: number, failuresForIp: number, limit = MAX_FAILED_ATTEMPTS): boolean {
  return failuresForRegistration >= limit || failuresForIp >= limit
}
