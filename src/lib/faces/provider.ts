export interface FaceMatch {
  faceId: string
  externalImageId: string
}

export interface FaceProvider {
  ensureCollection(collectionId: string): Promise<void>
  /** Indexes every face in the image and returns the new face ids. */
  indexFaces(collectionId: string, image: Uint8Array, externalImageId: string): Promise<string[]>
  /** Number of clearly visible faces in the image. */
  countFaces(image: Uint8Array): Promise<number>
  searchFaces(collectionId: string, image: Uint8Array, threshold: number): Promise<FaceMatch[]>
  deleteFaces(collectionId: string, faceIds: string[]): Promise<void>
  deleteCollection(collectionId: string): Promise<void>
}

export function collectionIdFor(eventId: string): string {
  return `fotofacil-${eventId}`
}
