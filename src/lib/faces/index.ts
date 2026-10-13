import 'server-only'
import { createFakeFaceProvider } from './fake'
import type { FaceProvider } from './provider'
import { createRekognitionProvider } from './rekognition'

export function getFaceProvider(): FaceProvider {
  switch (process.env.FACE_PROVIDER) {
    case 'rekognition':
      return createRekognitionProvider()
    case 'fake':
      return createFakeFaceProvider()
    default:
      throw new Error('FACE_PROVIDER must be "rekognition" or "fake"')
  }
}
