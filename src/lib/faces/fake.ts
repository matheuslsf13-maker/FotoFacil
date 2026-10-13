import { randomUUID } from 'node:crypto'
import { imageSize } from 'image-size'
import type { FaceProvider } from './provider'

/**
 * Deterministic stand-in for Rekognition, used in development and E2E tests.
 * A "person" is identified by the image's pixel size: two images with the same
 * width×height are the same person. Images under 50px have no face and square
 * images contain two faces.
 */
export type FakeFaceStore = Map<string, Array<{ faceId: string; person: string; externalImageId: string }>>

const holder = globalThis as unknown as { __fotofacilFakeFaces?: FakeFaceStore }

function sharedStore(): FakeFaceStore {
  holder.__fotofacilFakeFaces ??= new Map()
  return holder.__fotofacilFakeFaces
}

function measure(image: Uint8Array): { width: number; height: number } | null {
  try {
    const { width, height } = imageSize(image)
    return width && height ? { width, height } : null
  } catch {
    return null
  }
}

function hasFace(size: { width: number; height: number } | null): size is { width: number; height: number } {
  return size !== null && size.width >= 50 && size.height >= 50
}

export function createFakeFaceProvider(store: FakeFaceStore = sharedStore()): FaceProvider {
  const collection = (id: string) => {
    let faces = store.get(id)
    if (!faces) {
      faces = []
      store.set(id, faces)
    }
    return faces
  }

  return {
    async ensureCollection(collectionId) {
      collection(collectionId)
    },
    async indexFaces(collectionId, image, externalImageId) {
      const size = measure(image)
      if (!hasFace(size)) return []
      const faceId = randomUUID()
      collection(collectionId).push({ faceId, person: `${size.width}x${size.height}`, externalImageId })
      return [faceId]
    },
    async countFaces(image) {
      const size = measure(image)
      if (!hasFace(size)) return 0
      return size.width === size.height ? 2 : 1
    },
    async searchFaces(collectionId, image) {
      const size = measure(image)
      if (!hasFace(size)) return []
      const person = `${size.width}x${size.height}`
      return collection(collectionId)
        .filter(face => face.person === person)
        .map(face => ({ faceId: face.faceId, externalImageId: face.externalImageId }))
    },
    async deleteFaces(collectionId, faceIds) {
      const doomed = new Set(faceIds)
      store.set(collectionId, collection(collectionId).filter(face => !doomed.has(face.faceId)))
    },
    async deleteCollection(collectionId) {
      store.delete(collectionId)
    },
  }
}
