export const MEDIA_BUCKET = 'media'

export type MediaType = 'photo' | 'video'

export function mediaPaths(eventId: string, mediaId: string, type: MediaType, ext: string): { full: string; thumb: string } {
  const base = `events/${eventId}/${mediaId}`
  return type === 'photo'
    ? { full: `${base}/full.jpg`, thumb: `${base}/thumb.jpg` }
    : { full: `${base}/video.${ext}`, thumb: `${base}/poster.jpg` }
}

export function framePath(eventId: string, mediaId: string, index: number): string {
  return `events/${eventId}/${mediaId}/frames/${String(index).padStart(4, '0')}.jpg`
}

export function framePaths(eventId: string, mediaId: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => framePath(eventId, mediaId, i + 1))
}
