import {
  CreateCollectionCommand,
  DeleteCollectionCommand,
  DeleteFacesCommand,
  DetectFacesCommand,
  IndexFacesCommand,
  RekognitionClient,
  SearchFacesByImageCommand,
  type DetectFacesCommandOutput,
  type IndexFacesCommandOutput,
  type SearchFacesByImageCommandOutput,
} from '@aws-sdk/client-rekognition'
import type { FaceMatch, FaceProvider } from './provider'

export interface RekognitionSender {
  send(command: unknown): Promise<unknown>
}

const DELETE_CHUNK = 4096
const MIN_FACE_CONFIDENCE = 90

function errorName(error: unknown): string | undefined {
  return (error as { name?: string } | null)?.name
}

export function createRekognitionProvider(
  client: RekognitionSender = new RekognitionClient({ region: process.env.AWS_REGION ?? 'us-east-1' }),
): FaceProvider {
  return {
    async ensureCollection(collectionId) {
      try {
        await client.send(new CreateCollectionCommand({ CollectionId: collectionId }))
      } catch (error) {
        if (errorName(error) !== 'ResourceAlreadyExistsException') throw error
      }
    },

    async indexFaces(collectionId, image, externalImageId) {
      const out = (await client.send(
        new IndexFacesCommand({
          CollectionId: collectionId,
          Image: { Bytes: image },
          ExternalImageId: externalImageId,
          MaxFaces: 100,
          QualityFilter: 'AUTO',
          DetectionAttributes: [],
        }),
      )) as IndexFacesCommandOutput
      return (out.FaceRecords ?? []).map(r => r.Face?.FaceId).filter((id): id is string => Boolean(id))
    },

    async countFaces(image) {
      const out = (await client.send(new DetectFacesCommand({ Image: { Bytes: image } }))) as DetectFacesCommandOutput
      return (out.FaceDetails ?? []).filter(face => (face.Confidence ?? 0) >= MIN_FACE_CONFIDENCE).length
    },

    async searchFaces(collectionId, image, threshold) {
      try {
        const out = (await client.send(
          new SearchFacesByImageCommand({
            CollectionId: collectionId,
            Image: { Bytes: image },
            FaceMatchThreshold: threshold,
            MaxFaces: 4096,
          }),
        )) as SearchFacesByImageCommandOutput
        return (out.FaceMatches ?? []).flatMap((match): FaceMatch[] =>
          match.Face?.FaceId && match.Face.ExternalImageId
            ? [{ faceId: match.Face.FaceId, externalImageId: match.Face.ExternalImageId }]
            : [],
        )
      } catch (error) {
        if (errorName(error) === 'InvalidParameterException') return []
        throw error
      }
    },

    async deleteFaces(collectionId, faceIds) {
      for (let i = 0; i < faceIds.length; i += DELETE_CHUNK) {
        await client.send(new DeleteFacesCommand({ CollectionId: collectionId, FaceIds: faceIds.slice(i, i + DELETE_CHUNK) }))
      }
    },

    async deleteCollection(collectionId) {
      try {
        await client.send(new DeleteCollectionCommand({ CollectionId: collectionId }))
      } catch (error) {
        if (errorName(error) !== 'ResourceNotFoundException') throw error
      }
    },
  }
}
