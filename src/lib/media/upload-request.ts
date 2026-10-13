export type VideoExt = 'mp4' | 'mov' | 'webm' | 'm4v'

export interface UploadRequest {
  type: 'photo' | 'video'
  originalName: string
  ext: 'jpg' | VideoExt
  takenOn: string
  width: number
  height: number
  durationS: number | null
  frameCount: number
  faceIndexing: 'enabled' | 'unsupported'
}

const VIDEO_EXTS: VideoExt[] = ['mp4', 'mov', 'webm', 'm4v']

export function videoExt(fileName: string): VideoExt {
  const ext = fileName.split('.').pop()?.toLowerCase()
  return VIDEO_EXTS.includes(ext as VideoExt) ? (ext as VideoExt) : 'mp4'
}

export function isValidUploadRequest(req: UploadRequest): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(req.takenOn)) return false
  if (!Number.isInteger(req.frameCount) || req.frameCount < 0 || req.frameCount > 120) return false
  if (typeof req.originalName !== 'string' || req.originalName.length === 0) return false
  if (req.type === 'photo') return req.ext === 'jpg' && req.frameCount === 0 && req.faceIndexing === 'enabled'
  if (req.type === 'video') {
    if (!VIDEO_EXTS.includes(req.ext as VideoExt)) return false
    return req.faceIndexing === 'enabled' || req.frameCount === 0
  }
  return false
}
