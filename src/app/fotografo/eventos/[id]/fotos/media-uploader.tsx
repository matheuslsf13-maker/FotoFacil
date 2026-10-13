'use client'

import { useRef, useState, type DragEvent } from 'react'
import { useRouter } from 'next/navigation'
import { buttonClass } from '@/components/ui'
import { mapLimit, withRetry } from '@/lib/async'
import { MEDIA_BUCKET } from '@/lib/media/paths'
import { videoExt, type UploadRequest } from '@/lib/media/upload-request'
import { createClient } from '@/lib/supabase/browser'
import { prepareImage, UnsupportedMediaError } from '@/lib/upload/prepare-image'
import { prepareVideo } from '@/lib/upload/prepare-video'
import { createUpload, type SignedUpload } from './actions'

type ItemState = 'waiting' | 'preparing' | 'uploading' | 'processing' | 'done' | 'error'

interface QueueItem {
  name: string
  state: ItemState
  message?: string
}

const STATE_LABEL: Record<ItemState, string> = {
  waiting: 'Na fila',
  preparing: 'Preparando',
  uploading: 'Enviando',
  processing: 'Reconhecendo rostos',
  done: 'Pronto',
  error: 'Erro',
}

const FILES_AT_ONCE = 2
const MAX_VIDEO_BYTES = 500 * 1024 * 1024

export function MediaUploader({ eventId }: { eventId: string }) {
  const router = useRouter()
  const filesRef = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement>(null)
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [busy, setBusy] = useState(false)

  function update(index: number, patch: Partial<QueueItem>) {
    setQueue(previous => previous.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  async function put(target: SignedUpload, blob: Blob) {
    const supabase = createClient()
    const { error } = await supabase.storage
      .from(MEDIA_BUCKET)
      .uploadToSignedUrl(target.path, target.token, blob, { contentType: blob.type || 'application/octet-stream' })
    if (error) throw new Error(`Falha ao enviar: ${error.message}`)
  }

  async function uploadOne(file: File, index: number) {
    try {
      update(index, { state: 'preparing' })
      let request: UploadRequest
      let full: Blob
      let thumb: Blob
      let frames: Blob[] = []
      if (file.type.startsWith('video/')) {
        if (file.size > MAX_VIDEO_BYTES) throw new UnsupportedMediaError('Vídeo maior que 500 MB.')
        const video = await prepareVideo(file)
        request = {
          type: 'video',
          originalName: file.name,
          ext: videoExt(file.name),
          takenOn: video.takenOn,
          width: video.width,
          height: video.height,
          durationS: video.durationS,
          frameCount: video.frames.length,
          faceIndexing: video.faceIndexing,
        }
        full = file
        thumb = video.poster
        frames = video.frames
      } else {
        const image = await prepareImage(file)
        request = {
          type: 'photo',
          originalName: file.name,
          ext: 'jpg',
          takenOn: image.takenOn,
          width: image.width,
          height: image.height,
          durationS: null,
          frameCount: 0,
          faceIndexing: 'enabled',
        }
        full = image.full
        thumb = image.thumb
      }

      update(index, { state: 'uploading' })
      const response = await createUpload(eventId, request)
      if ('error' in response) throw new Error(response.error)
      const { ticket } = response
      await withRetry(() => put(ticket.full, full))
      await withRetry(() => put(ticket.thumb, thumb))
      await mapLimit(frames, 4, (frame, i) => withRetry(() => put(ticket.frames[i], frame)))

      update(index, { state: 'processing' })
      const processed = await fetch(`/api/media/${ticket.mediaId}/process`, { method: 'POST' })
      const body = (await processed.json().catch(() => ({}))) as { result?: string }
      if (!processed.ok || body.result === 'error') {
        update(index, { state: 'error', message: 'Enviado, mas o reconhecimento falhou. Use "Tentar de novo" na galeria.' })
      } else {
        update(index, {
          state: 'done',
          message: request.faceIndexing === 'unsupported' ? 'Vídeo enviado sem reconhecimento facial (formato não suportado pelo navegador).' : undefined,
        })
      }
    } catch (error) {
      update(index, { state: 'error', message: error instanceof Error ? error.message : 'Falha no envio.' })
    }
  }

  async function handleFiles(list: FileList | null) {
    const files = Array.from(list ?? []).filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'))
    if (files.length === 0 || busy) return
    setQueue(files.map(file => ({ name: file.name, state: 'waiting' })))
    setBusy(true)
    await mapLimit(files, FILES_AT_ONCE, (file, index) => uploadOne(file, index))
    setBusy(false)
    if (filesRef.current) filesRef.current.value = ''
    if (folderRef.current) folderRef.current.value = ''
    router.refresh()
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    void handleFiles(event.dataTransfer.files)
  }

  const done = queue.filter(item => item.state === 'done').length

  return (
    <div
      onDragOver={event => event.preventDefault()}
      onDrop={onDrop}
      className="space-y-3 rounded-xl border-2 border-dashed border-gray-300 bg-white p-4"
    >
      <p className="text-sm text-gray-600">Arraste fotos e vídeos aqui ou escolha abaixo.</p>
      <div className="flex flex-wrap gap-2">
        <label className={buttonClass('primary')}>
          Escolher arquivos
          <input
            ref={filesRef}
            type="file"
            multiple
            accept="image/*,video/*"
            className="sr-only"
            disabled={busy}
            onChange={event => void handleFiles(event.target.files)}
          />
        </label>
        <label className={buttonClass('secondary')}>
          Escolher pasta
          <input
            ref={folderRef}
            type="file"
            multiple
            className="sr-only"
            disabled={busy}
            onChange={event => void handleFiles(event.target.files)}
            {...{ webkitdirectory: '' }}
          />
        </label>
      </div>
      {queue.length > 0 ? (
        <div className="space-y-1">
          <p className="text-sm font-medium">
            {done} de {queue.length} prontos
          </p>
          <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
            {queue.map((item, index) => (
              <li key={`${item.name}-${index}`} data-testid="upload-item">
                <span className="font-medium">{item.name}</span> · {STATE_LABEL[item.state]}
                {item.message ? <span className="block text-xs text-gray-600">{item.message}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
