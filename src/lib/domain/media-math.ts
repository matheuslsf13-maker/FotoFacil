import { localDateOf } from './dates'

export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height))
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

export function frameTimes(durationS: number, maxFrames = 120): number[] {
  if (!(durationS > 0)) return [0]
  const step = Math.max(1, durationS / maxFrames)
  const count = Math.min(maxFrames, Math.ceil(durationS / step))
  const last = Math.max(0, durationS - 0.1)
  return Array.from({ length: count }, (_, i) => Math.round(Math.min(i * step + 0.5, last) * 100) / 100)
}

export function takenOnFrom(exifDate: Date | null, now: Date): string {
  if (exifDate && !Number.isNaN(exifDate.getTime()) && exifDate.getFullYear() >= 2000) return localDateOf(exifDate)
  return localDateOf(now)
}
