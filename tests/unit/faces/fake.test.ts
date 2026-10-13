import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFakeFaceProvider } from '@/lib/faces/fake'
import { getFaceProvider } from '@/lib/faces'
import { pngHeader } from './png'

describe('createFakeFaceProvider', () => {
  it('detects 0 faces in tiny images, 2 in square images and 1 otherwise', async () => {
    const faces = createFakeFaceProvider(new Map())
    expect(await faces.countFaces(pngHeader(20, 20))).toBe(0)
    expect(await faces.countFaces(pngHeader(500, 500))).toBe(2)
    expect(await faces.countFaces(pngHeader(640, 480))).toBe(1)
    expect(await faces.countFaces(new Uint8Array([1, 2, 3]))).toBe(0)
  })

  it('matches images with the same size inside the same collection only', async () => {
    const faces = createFakeFaceProvider(new Map())
    await faces.indexFaces('c1', pngHeader(640, 480), 'm1')
    await faces.indexFaces('c1', pngHeader(800, 600), 'm2')
    await faces.indexFaces('c2', pngHeader(640, 480), 'm3')
    const matches = await faces.searchFaces('c1', pngHeader(640, 480), 90)
    expect(matches.map(m => m.externalImageId)).toEqual(['m1'])
  })

  it('deletes faces and collections', async () => {
    const faces = createFakeFaceProvider(new Map())
    const [faceId] = await faces.indexFaces('c1', pngHeader(640, 480), 'm1')
    await faces.indexFaces('c1', pngHeader(640, 480), 'm2')
    await faces.deleteFaces('c1', [faceId])
    expect((await faces.searchFaces('c1', pngHeader(640, 480), 90)).map(m => m.externalImageId)).toEqual(['m2'])
    await faces.deleteCollection('c1')
    expect(await faces.searchFaces('c1', pngHeader(640, 480), 90)).toEqual([])
  })
})

describe('getFaceProvider', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('requires an explicit provider', () => {
    vi.stubEnv('FACE_PROVIDER', 'nope')
    expect(() => getFaceProvider()).toThrow('FACE_PROVIDER')
    vi.stubEnv('FACE_PROVIDER', 'fake')
    expect(typeof getFaceProvider().searchFaces).toBe('function')
  })
})
