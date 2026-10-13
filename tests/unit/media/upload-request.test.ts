import { describe, expect, it } from 'vitest'
import { isValidUploadRequest, videoExt, type UploadRequest } from '@/lib/media/upload-request'

const photo: UploadRequest = {
  type: 'photo',
  originalName: 'IMG_0001.JPG',
  ext: 'jpg',
  takenOn: '2026-10-12',
  width: 3000,
  height: 2000,
  durationS: null,
  frameCount: 0,
  faceIndexing: 'enabled',
}

describe('isValidUploadRequest', () => {
  it('accepts a well-formed photo and video', () => {
    expect(isValidUploadRequest(photo)).toBe(true)
    expect(
      isValidUploadRequest({ ...photo, type: 'video', ext: 'mp4', durationS: 12.5, frameCount: 13, originalName: 'v.mp4' }),
    ).toBe(true)
  })

  it('rejects inconsistent requests', () => {
    expect(isValidUploadRequest({ ...photo, ext: 'mp4' })).toBe(false)
    expect(isValidUploadRequest({ ...photo, frameCount: 3 })).toBe(false)
    expect(isValidUploadRequest({ ...photo, takenOn: '12/10/2026' })).toBe(false)
    expect(isValidUploadRequest({ ...photo, type: 'video', ext: 'mp4', frameCount: 121 })).toBe(false)
    expect(isValidUploadRequest({ ...photo, type: 'video', ext: 'mp4', faceIndexing: 'unsupported', frameCount: 2 })).toBe(false)
  })
})

describe('videoExt', () => {
  it('keeps known extensions and defaults to mp4', () => {
    expect(videoExt('Clip.MOV')).toBe('mov')
    expect(videoExt('a.webm')).toBe('webm')
    expect(videoExt('noext')).toBe('mp4')
    expect(videoExt('x.avi')).toBe('mp4')
  })
})
