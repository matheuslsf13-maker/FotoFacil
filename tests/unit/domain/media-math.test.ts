import { describe, expect, it } from 'vitest'
import { fitWithin, frameTimes, takenOnFrom } from '@/lib/domain/media-math'

describe('fitWithin', () => {
  it('scales the longest side down to the limit keeping the ratio', () => {
    expect(fitWithin(6000, 4000, 3000)).toEqual({ width: 3000, height: 2000 })
    expect(fitWithin(4000, 6000, 400)).toEqual({ width: 267, height: 400 })
  })

  it('never upscales', () => {
    expect(fitWithin(640, 480, 3000)).toEqual({ width: 640, height: 480 })
  })
})

describe('frameTimes', () => {
  it('takes one frame per second for short videos', () => {
    expect(frameTimes(3.2)).toEqual([0.5, 1.5, 2.5, 3.1])
  })

  it('spreads at most 120 frames over long videos', () => {
    const times = frameTimes(300)
    expect(times).toHaveLength(120)
    expect(times[0]).toBe(0.5)
    expect(times[1]).toBe(3)
    expect(times.at(-1)).toBeLessThan(300)
  })

  it('returns a single frame for zero or unknown durations', () => {
    expect(frameTimes(0)).toEqual([0])
    expect(frameTimes(Number.NaN)).toEqual([0])
  })
})

describe('takenOnFrom', () => {
  const now = new Date(2026, 9, 13, 10, 0)

  it('uses the camera date when present', () => {
    expect(takenOnFrom(new Date(2026, 9, 12, 23, 30), now)).toBe('2026-10-12')
  })

  it('falls back to today when the photo has no usable EXIF date', () => {
    expect(takenOnFrom(null, now)).toBe('2026-10-13')
    expect(takenOnFrom(new Date(Number.NaN), now)).toBe('2026-10-13')
    expect(takenOnFrom(new Date(1980, 0, 1), now)).toBe('2026-10-13')
  })
})
