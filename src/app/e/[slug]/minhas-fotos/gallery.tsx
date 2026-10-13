'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { downloadZip } from 'client-zip'
import { Button, Card, ErrorText, Select, buttonClass } from '@/components/ui'
import { formatDayMonth } from '@/lib/domain/dates'
import { chunk, distinctDays, downloadName, filterMedia, type GalleryItem, type TypeFilter } from '@/lib/domain/gallery'

const ZIP_BATCH = 200
const SHARE_BATCH = 10
const TYPE_LABEL: Record<TypeFilter, string> = { all: 'Todos', photo: 'Fotos', video: 'Vídeos' }

class ExpiredLinkError extends Error {}

async function fetchMedia(item: GalleryItem): Promise<Response> {
  const response = await fetch(item.fullUrl)
  if (!response.ok) throw new ExpiredLinkError()
  return response
}

async function* zipEntries(items: GalleryItem[], offset: number) {
  for (const [i, item] of items.entries()) {
    yield { name: downloadName(item, offset + i), input: await fetchMedia(item) }
  }
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function Gallery({
  slug,
  items: allItems,
  hasNewMedia,
  whatsappUrl,
}: {
  slug: string
  items: GalleryItem[]
  hasNewMedia: boolean
  whatsappUrl: string
}) {
  const router = useRouter()
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const [type, setType] = useState<TypeFilter>('all')
  const [day, setDay] = useState('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [viewer, setViewer] = useState<GalleryItem | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [shareFiles, setShareFiles] = useState<File[] | null>(null)
  const [shareNext, setShareNext] = useState<{ items: GalleryItem[]; offset: number } | null>(null)

  const items = useMemo(() => allItems.filter(item => !hiddenIds.has(item.id)), [allItems, hiddenIds])
  const visible = useMemo(() => filterMedia(items, { type, day }), [items, type, day])
  const days = useMemo(() => distinctDays(items), [items])
  const selectedItems = items.filter(item => selected.has(item.id))
  const photoCount = items.filter(item => item.type === 'photo').length
  const videoCount = items.length - photoCount

  function toggle(id: string) {
    setSelected(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleError(e: unknown) {
    if (e instanceof ExpiredLinkError) {
      setError('Os links expiraram. Atualizamos a página: tente de novo.')
      router.refresh()
    } else {
      setError('Não foi possível baixar. Tente de novo.')
    }
  }

  async function downloadZipOf(list: GalleryItem[]) {
    setError(null)
    try {
      const parts = chunk(list, ZIP_BATCH)
      for (const [p, part] of parts.entries()) {
        setBusy(parts.length > 1 ? `Preparando o ZIP ${p + 1} de ${parts.length}…` : 'Preparando o ZIP…')
        const blob = await downloadZip(zipEntries(part, p * ZIP_BATCH)).blob()
        saveBlob(blob, parts.length > 1 ? `fotofacil-parte-${p + 1}.zip` : 'fotofacil.zip')
      }
    } catch (e) {
      handleError(e)
    } finally {
      setBusy(null)
    }
  }

  async function downloadOne(item: GalleryItem) {
    setError(null)
    try {
      saveBlob(await (await fetchMedia(item)).blob(), downloadName(item, items.indexOf(item)))
    } catch (e) {
      handleError(e)
    }
  }

  // Sharing needs a fresh tap, so files are fetched first and shared on a second button.
  async function prepareShare(list: GalleryItem[], offset: number) {
    setError(null)
    setBusy('Preparando…')
    try {
      const batch = list.slice(0, SHARE_BATCH)
      const files = await Promise.all(
        batch.map(async (item, i) => {
          const blob = await (await fetchMedia(item)).blob()
          return new File([blob], downloadName(item, offset + i), {
            type: blob.type || (item.type === 'photo' ? 'image/jpeg' : 'video/mp4'),
          })
        }),
      )
      if (!navigator.canShare?.({ files })) {
        await downloadZipOf(list)
        return
      }
      setShareFiles(files)
      setShareNext(list.length > SHARE_BATCH ? { items: list.slice(SHARE_BATCH), offset: offset + SHARE_BATCH } : null)
    } catch (e) {
      handleError(e)
    } finally {
      setBusy(null)
    }
  }

  async function shareNow() {
    if (!shareFiles) return
    try {
      await navigator.share({ files: shareFiles })
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError('Não foi possível salvar. Use "Baixar ZIP".')
    }
    setShareFiles(null)
    if (shareNext) await prepareShare(shareNext.items, shareNext.offset)
  }

  async function hide(item: GalleryItem) {
    await fetch(`/api/e/${slug}/media/${item.id}/hide`, { method: 'POST' })
    setHiddenIds(previous => new Set(previous).add(item.id))
    setSelected(previous => {
      const next = new Set(previous)
      next.delete(item.id)
      return next
    })
    setViewer(null)
  }

  if (items.length === 0) {
    return (
      <Card className="space-y-3 text-center">
        <p className="font-medium">Não achamos fotos suas neste evento.</p>
        <p className="text-sm text-gray-600">
          Tente com outra selfie, de frente e com boa luz. Se ainda assim não aparecer, fale com o fotógrafo.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href={`/e/${slug}/minhas-fotos?buscar=1`} className={buttonClass('primary')}>
            Tentar outra selfie
          </Link>
          <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className={buttonClass('secondary')}>
            Falar no WhatsApp
          </a>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {hasNewMedia ? (
        <p className="rounded-lg bg-pink-50 p-3 text-sm">
          O fotógrafo enviou fotos novas.{' '}
          <Link href={`/e/${slug}/minhas-fotos?buscar=1`} className="font-medium underline">
            Buscar fotos novas
          </Link>
        </p>
      ) : null}
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">Suas fotos</h2>
        <p className="text-sm text-gray-600">
          {photoCount} fotos e {videoCount} vídeos
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'photo', 'video'] as const).map(option => (
          <button
            key={option}
            type="button"
            onClick={() => setType(option)}
            className={`rounded-full px-3 py-1 text-sm ${type === option ? 'bg-pink-600 text-white' : 'bg-white ring-1 ring-gray-300'}`}
          >
            {TYPE_LABEL[option]}
          </button>
        ))}
        {days.length > 1 ? (
          <Select value={day} onChange={event => setDay(event.target.value)} className="w-auto" aria-label="Dia">
            <option value="all">Todos os dias</option>
            {days.map(d => (
              <option key={d} value={d}>
                {formatDayMonth(d)}
              </option>
            ))}
          </Select>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => setSelected(new Set(visible.map(item => item.id)))}>
          {day === 'all' ? 'Selecionar tudo' : `Selecionar o dia ${formatDayMonth(day)}`}
        </Button>
        {selected.size > 0 ? (
          <Button type="button" variant="secondary" onClick={() => setSelected(new Set())}>
            Limpar seleção
          </Button>
        ) : null}
      </div>
      <ul className="grid grid-cols-3 gap-1 sm:grid-cols-4">
        {visible.map((item, index) => (
          <li key={item.id} className="relative aspect-square overflow-hidden rounded-md bg-gray-200">
            <button
              type="button"
              aria-label={`Abrir ${item.type === 'photo' ? 'foto' : 'vídeo'} ${index + 1}`}
              onClick={() => setViewer(item)}
              className="h-full w-full"
            >
              <img src={item.thumbUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
            {item.type === 'video' ? (
              <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-black/60 px-1 text-xs text-white">▶</span>
            ) : null}
            <input
              type="checkbox"
              aria-label={`Selecionar ${index + 1}`}
              checked={selected.has(item.id)}
              onChange={() => toggle(item.id)}
              className="absolute left-1 top-1 h-5 w-5"
            />
          </li>
        ))}
      </ul>
      <div className="sticky bottom-0 space-y-2 bg-gray-50 py-2">
        <ErrorText>{error}</ErrorText>
        {busy ? <p className="text-sm text-gray-600">{busy}</p> : null}
        {shareFiles ? (
          <Button type="button" onClick={shareNow}>
            Salvar agora ({shareFiles.length} arquivos)
          </Button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={Boolean(busy) || selectedItems.length === 0} onClick={() => prepareShare(selectedItems, 0)}>
              Salvar na galeria ({selectedItems.length})
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={Boolean(busy) || selectedItems.length === 0}
              onClick={() => downloadZipOf(selectedItems)}
            >
              Baixar ZIP
            </Button>
          </div>
        )}
      </div>
      {viewer ? (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4">
          <div className="flex min-h-0 flex-1 items-center justify-center">
            {viewer.type === 'photo' ? (
              <img src={viewer.fullUrl} alt="" className="max-h-full max-w-full object-contain" />
            ) : (
              <video src={viewer.fullUrl} controls playsInline className="max-h-full max-w-full" />
            )}
          </div>
          <div className="flex flex-wrap justify-center gap-2 pt-3">
            <Button type="button" onClick={() => downloadOne(viewer)}>
              Baixar
            </Button>
            <Button type="button" variant="secondary" onClick={() => hide(viewer)}>
              Não sou eu
            </Button>
            <Button type="button" variant="secondary" onClick={() => setViewer(null)}>
              Fechar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
