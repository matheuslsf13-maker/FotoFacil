import { fitWithin, frameTimes, takenOnFrom } from '@/lib/domain/media-math'
import { drawToJpeg } from './prepare-image'

export interface PreparedVideo {
  poster: Blob
  frames: Blob[]
  width: number
  height: number
  durationS: number
  takenOn: string
  faceIndexing: 'enabled' | 'unsupported'
}

function waitFor(video: HTMLVideoElement, event: 'loadeddata' | 'seeked', timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => cleanup(new Error('timeout')), timeoutMs)
    const onEvent = () => cleanup()
    const onError = () => cleanup(new Error('decode'))
    function cleanup(error?: Error) {
      clearTimeout(timer)
      video.removeEventListener(event, onEvent)
      video.removeEventListener('error', onError)
      if (error) reject(error)
      else resolve()
    }
    video.addEventListener(event, onEvent)
    video.addEventListener('error', onError)
  })
}

async function placeholderPoster(): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = 400
  canvas.height = 225
  const context = canvas.getContext('2d')!
  context.fillStyle = '#374151'
  context.fillRect(0, 0, 400, 225)
  context.fillStyle = '#ffffff'
  context.font = '28px sans-serif'
  context.textAlign = 'center'
  context.fillText('▶ vídeo', 200, 122)
  return drawToJpeg(canvas, { width: 400, height: 225 }, 0.8)
}

export async function prepareVideo(file: File, now: Date = new Date()): Promise<PreparedVideo> {
  const takenOn = takenOnFrom(null, now)
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.src = url
  try {
    await waitFor(video, 'loadeddata', 15_000)
    const durationS = Number.isFinite(video.duration) ? video.duration : 0
    const frameSize = fitWithin(video.videoWidth, video.videoHeight, 1280)
    const posterSize = fitWithin(video.videoWidth, video.videoHeight, 400)
    const frames: Blob[] = []
    let poster: Blob | null = null
    for (const time of frameTimes(durationS)) {
      video.currentTime = time
      await waitFor(video, 'seeked', 5_000)
      if (!poster) poster = await drawToJpeg(video, posterSize, 0.75)
      frames.push(await drawToJpeg(video, frameSize, 0.8))
    }
    return {
      poster: poster ?? (await placeholderPoster()),
      frames,
      width: video.videoWidth,
      height: video.videoHeight,
      durationS: Math.round(durationS * 100) / 100,
      takenOn,
      faceIndexing: 'enabled',
    }
  } catch {
    return { poster: await placeholderPoster(), frames: [], width: 0, height: 0, durationS: 0, takenOn, faceIndexing: 'unsupported' }
  } finally {
    URL.revokeObjectURL(url)
    video.removeAttribute('src')
    video.load()
  }
}
