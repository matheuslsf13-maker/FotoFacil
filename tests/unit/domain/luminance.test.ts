import { describe, expect, it } from 'vitest'
import { averageLuminance, isTooDark } from '@/lib/domain/luminance'

function pixels(rgb: [number, number, number], count = 4): Uint8ClampedArray {
  return new Uint8ClampedArray(Array.from({ length: count }, () => [...rgb, 255]).flat())
}

describe('luminance', () => {
  it('averages perceived brightness', () => {
    expect(averageLuminance(pixels([255, 255, 255]))).toBeCloseTo(255)
    expect(averageLuminance(pixels([0, 0, 0]))).toBe(0)
    expect(averageLuminance(new Uint8ClampedArray())).toBe(0)
  })

  it('flags dark selfies', () => {
    expect(isTooDark(averageLuminance(pixels([20, 20, 20])))).toBe(true)
    expect(isTooDark(averageLuminance(pixels([120, 110, 100])))).toBe(false)
  })
})
