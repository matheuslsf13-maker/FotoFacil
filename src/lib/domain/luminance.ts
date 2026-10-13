export const DARK_THRESHOLD = 50

export function averageLuminance(rgba: Uint8ClampedArray): number {
  const pixels = rgba.length / 4
  if (pixels === 0) return 0
  let sum = 0
  for (let i = 0; i < rgba.length; i += 4) sum += 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]
  return sum / pixels
}

export function isTooDark(luminance: number): boolean {
  return luminance < DARK_THRESHOLD
}
