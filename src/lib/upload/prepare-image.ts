import exifr from 'exifr'
import { fitWithin, takenOnFrom } from '@/lib/domain/media-math'

export class UnsupportedMediaError extends Error {}

export interface PreparedImage {
  full: Blob
  thumb: Blob
  width: number
  height: number
  takenOn: string
}

export async function drawToJpeg(
  source: CanvasImageSource,
  size: { width: number; height: number },
  quality: number,
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas indisponível neste navegador.')
  context.drawImage(source, 0, 0, size.width, size.height)
  return new Promise((resolve, reject) =>
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Falha ao gerar a imagem.'))), 'image/jpeg', quality),
  )
}

async function decode(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new UnsupportedMediaError('Formato de imagem não suportado. Envie JPEG ou PNG.')
  }
}

async function readExifDate(file: File): Promise<Date | null> {
  try {
    const exif = await exifr.parse(file, ['DateTimeOriginal'])
    return exif?.DateTimeOriginal instanceof Date ? exif.DateTimeOriginal : null
  } catch {
    return null
  }
}

export async function prepareImage(file: File, now: Date = new Date()): Promise<PreparedImage> {
  const bitmap = await decode(file)
  try {
    const fullSize = fitWithin(bitmap.width, bitmap.height, 3000)
    const thumbSize = fitWithin(bitmap.width, bitmap.height, 400)
    const [full, thumb, exifDate] = await Promise.all([
      drawToJpeg(bitmap, fullSize, 0.85),
      drawToJpeg(bitmap, thumbSize, 0.75),
      readExifDate(file),
    ])
    return { full, thumb, width: fullSize.width, height: fullSize.height, takenOn: takenOnFrom(exifDate, now) }
  } finally {
    bitmap.close()
  }
}

export async function resizeImageFile(file: Blob, maxSide: number): Promise<Blob> {
  const bitmap = await decode(file)
  try {
    return await drawToJpeg(bitmap, fitWithin(bitmap.width, bitmap.height, maxSide), 0.9)
  } finally {
    bitmap.close()
  }
}
