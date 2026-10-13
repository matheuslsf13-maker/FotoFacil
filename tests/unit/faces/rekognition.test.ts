import {
  CreateCollectionCommand,
  DeleteCollectionCommand,
  DeleteFacesCommand,
  IndexFacesCommand,
  SearchFacesByImageCommand,
} from '@aws-sdk/client-rekognition'
import { describe, expect, it, vi } from 'vitest'
import { collectionIdFor } from '@/lib/faces/provider'
import { createRekognitionProvider } from '@/lib/faces/rekognition'

function awsError(name: string): Error {
  const error = new Error(name)
  error.name = name
  return error
}

function fakeClient(handler: (command: unknown) => unknown) {
  return { send: vi.fn(async (command: unknown) => handler(command)) }
}

describe('collectionIdFor', () => {
  it('builds a Rekognition-safe collection id', () => {
    expect(collectionIdFor('0b7e-11')).toBe('fotofacil-0b7e-11')
  })
})

describe('createRekognitionProvider', () => {
  it('treats an existing collection as success', async () => {
    const client = fakeClient(command => {
      if (command instanceof CreateCollectionCommand) throw awsError('ResourceAlreadyExistsException')
    })
    await expect(createRekognitionProvider(client).ensureCollection('c1')).resolves.toBeUndefined()
  })

  it('indexes faces with the media id as external id', async () => {
    const client = fakeClient(() => ({ FaceRecords: [{ Face: { FaceId: 'f1' } }, { Face: { FaceId: 'f2' } }] }))
    const ids = await createRekognitionProvider(client).indexFaces('c1', new Uint8Array([1, 2]), 'media-1')
    expect(ids).toEqual(['f1', 'f2'])
    const command = client.send.mock.calls[0][0] as IndexFacesCommand
    expect(command).toBeInstanceOf(IndexFacesCommand)
    expect(command.input).toMatchObject({ CollectionId: 'c1', ExternalImageId: 'media-1', MaxFaces: 100, QualityFilter: 'AUTO' })
  })

  it('counts only confident faces', async () => {
    const client = fakeClient(() => ({ FaceDetails: [{ Confidence: 99.5 }, { Confidence: 40 }] }))
    expect(await createRekognitionProvider(client).countFaces(new Uint8Array([1]))).toBe(1)
  })

  it('maps search matches and returns no matches when the image has no face', async () => {
    const client = fakeClient(() => ({ FaceMatches: [{ Face: { FaceId: 'f1', ExternalImageId: 'm1' } }] }))
    const provider = createRekognitionProvider(client)
    expect(await provider.searchFaces('c1', new Uint8Array([1]), 92)).toEqual([{ faceId: 'f1', externalImageId: 'm1' }])
    const command = client.send.mock.calls[0][0] as SearchFacesByImageCommand
    expect(command.input).toMatchObject({ CollectionId: 'c1', FaceMatchThreshold: 92, MaxFaces: 4096 })

    const noFace = fakeClient(() => {
      throw awsError('InvalidParameterException')
    })
    expect(await createRekognitionProvider(noFace).searchFaces('c1', new Uint8Array([1]), 90)).toEqual([])
  })

  it('deletes faces in chunks of 4096 and skips empty lists', async () => {
    const client = fakeClient(() => ({}))
    const provider = createRekognitionProvider(client)
    await provider.deleteFaces('c1', [])
    expect(client.send).not.toHaveBeenCalled()
    await provider.deleteFaces('c1', Array.from({ length: 5000 }, (_, i) => `f${i}`))
    const sizes = client.send.mock.calls.map(([command]) => (command as DeleteFacesCommand).input.FaceIds?.length)
    expect(sizes).toEqual([4096, 904])
  })

  it('treats a missing collection as already deleted', async () => {
    const client = fakeClient(command => {
      if (command instanceof DeleteCollectionCommand) throw awsError('ResourceNotFoundException')
    })
    await expect(createRekognitionProvider(client).deleteCollection('c1')).resolves.toBeUndefined()
  })
})
