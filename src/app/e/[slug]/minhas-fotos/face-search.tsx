'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Card, ErrorText, buttonClass } from '@/components/ui'
import { averageLuminance, isTooDark } from '@/lib/domain/luminance'
import { fitWithin } from '@/lib/domain/media-math'
import { FACE_CONSENT_LABEL, FACE_CONSENT_TEXT } from '@/lib/legal'
import { SEARCH_MESSAGES } from '@/lib/search/messages'
import type { SearchOutcome } from '@/lib/search/search'
import { resizeImageFile, UnsupportedMediaError } from '@/lib/upload/prepare-image'

type Mode = 'choose' | 'camera' | 'searching'

export function FaceSearch({ slug, needsConsent }: { slug: string; needsConsent: boolean }) {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [consent, setConsent] = useState(!needsConsent)
  const [mode, setMode] = useState<Mode>('choose')
  const [error, setError] = useState<string | null>(null)

  function stopCamera() {
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
  }

  useEffect(() => {
    const streams = streamRef
    return () => streams.current?.getTracks().forEach(track => track.stop())
  }, [])

  useEffect(() => {
    if (mode === 'camera' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
      void videoRef.current.play().catch(() => undefined)
    }
  }, [mode])

  async function openCamera() {
    setError(null)
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      })
      setMode('camera')
    } catch {
      setError('Não foi possível abrir a câmera. Use "Enviar foto".')
    }
  }

  async function submit(selfie: Blob) {
    setMode('searching')
    setError(null)
    const form = new FormData()
    form.append('selfie', selfie, 'selfie.jpg')
    form.append('consent', String(consent))
    const response = await fetch(`/api/e/${slug}/search`, { method: 'POST', body: form })
    const outcome = (await response.json().catch(() => null)) as SearchOutcome | null
    if (outcome?.ok) {
      router.replace(`/e/${slug}/minhas-fotos`)
      router.refresh()
      return
    }
    setError(outcome ? SEARCH_MESSAGES[outcome.reason] : 'Algo deu errado. Tente de novo.')
    setMode('choose')
  }

  async function capture() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const size = fitWithin(video.videoWidth, video.videoHeight, 1600)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const context = canvas.getContext('2d')
    if (!context) return
    context.drawImage(video, 0, 0, size.width, size.height)
    const center = context.getImageData(
      Math.floor(size.width / 4),
      Math.floor(size.height / 4),
      Math.floor(size.width / 2),
      Math.floor(size.height / 2),
    ).data
    if (isTooDark(averageLuminance(center))) {
      setError('Está muito escuro. Procure um lugar com mais luz e tente de novo.')
      return
    }
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9))
    if (!blob) return
    stopCamera()
    await submit(blob)
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    try {
      await submit(await resizeImageFile(file, 1600))
    } catch (e) {
      setMode('choose')
      setError(e instanceof UnsupportedMediaError ? e.message : 'Não foi possível ler essa foto.')
    }
  }

  return (
    <Card className="space-y-4">
      <h2 className="text-lg font-semibold">Encontre suas fotos</h2>
      {needsConsent ? (
        <div className="space-y-2 text-sm">
          <p className="text-gray-600">{FACE_CONSENT_TEXT}</p>
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />
            {FACE_CONSENT_LABEL}
          </label>
        </div>
      ) : null}

      {mode === 'camera' ? (
        <div className="space-y-3">
          <div className="relative mx-auto aspect-[3/4] w-full max-w-sm overflow-hidden rounded-2xl bg-black">
            <video ref={videoRef} playsInline muted className="h-full w-full -scale-x-100 object-cover" />
            <div
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-1/2 h-[70%] w-[62%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-4 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
            />
            <p className="absolute inset-x-0 bottom-3 text-center text-sm text-white">Centralize o rosto na moldura e procure luz</p>
          </div>
          <div className="flex justify-center gap-2">
            <Button type="button" onClick={capture}>
              Tirar foto
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                stopCamera()
                setMode('choose')
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}

      {mode === 'choose' ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={openCamera} disabled={!consent}>
            Tirar selfie
          </Button>
          <label className={`${buttonClass('secondary')} ${consent ? '' : 'pointer-events-none opacity-50'}`}>
            Enviar foto
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={!consent}
              onChange={event => void onFile(event.target.files?.[0])}
            />
          </label>
        </div>
      ) : null}

      {mode === 'searching' ? <p className="text-sm text-gray-600">Procurando suas fotos…</p> : null}
      <ErrorText>{error}</ErrorText>
    </Card>
  )
}
