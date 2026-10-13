'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, ErrorText, Select } from '@/components/ui'
import type { ActionState } from '@/lib/action-state'
import { formatDayMonth } from '@/lib/domain/dates'
import { updateMediaDay } from './actions'
import { closeEventAndDeleteMedia, deleteSelectedMedia } from './delete-actions'

export interface GridItem {
  id: string
  type: 'photo' | 'video'
  takenOn: string
  status: 'uploading' | 'processing' | 'ready' | 'error'
  faceIndexing: 'enabled' | 'unsupported'
  originalName: string
  thumbUrl: string | null
}

const STATUS_LABEL: Record<GridItem['status'], string> = {
  uploading: 'Enviando',
  processing: 'Processando',
  ready: '',
  error: 'Erro',
}

export function MediaGrid({
  eventId,
  items,
  days,
  canClose,
}: {
  eventId: string
  items: GridItem[]
  days: string[]
  canClose: boolean
}) {
  const router = useRouter()
  const [day, setDay] = useState('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const visible = items.filter(item => day === 'all' || item.takenOn === day)

  function toggle(id: string) {
    setSelected(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function run(action: () => Promise<ActionState>) {
    startTransition(async () => {
      const result = await action()
      setError(result.error)
      if (!result.error) setSelected(new Set())
    })
  }

  function retry(id: string) {
    startTransition(async () => {
      await fetch(`/api/media/${id}/process`, { method: 'POST' })
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={day} onChange={event => setDay(event.target.value)} className="w-auto">
          <option value="all">Todos os dias ({items.length})</option>
          {days.map(d => (
            <option key={d} value={d}>
              {formatDayMonth(d)} ({items.filter(item => item.takenOn === d).length})
            </option>
          ))}
        </Select>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setSelected(new Set(visible.map(item => item.id)))}
          disabled={visible.length === 0}
        >
          Selecionar tudo
        </Button>
        <Button
          type="button"
          variant="danger"
          disabled={pending || selected.size === 0}
          onClick={() => {
            if (confirm(`Excluir ${selected.size} arquivo(s)? Isso não pode ser desfeito.`)) {
              run(() => deleteSelectedMedia(eventId, [...selected]))
            }
          }}
        >
          Excluir selecionadas ({selected.size})
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {visible.map(item => (
          <li key={item.id} className="space-y-1" data-testid="media-tile">
            <label className="relative block aspect-square overflow-hidden rounded-lg bg-gray-200">
              {item.thumbUrl ? <img src={item.thumbUrl} alt={item.originalName} className="h-full w-full object-cover" /> : null}
              <input
                type="checkbox"
                aria-label={`Selecionar ${item.originalName}`}
                checked={selected.has(item.id)}
                onChange={() => toggle(item.id)}
                className="absolute left-1 top-1 h-5 w-5"
              />
              {item.type === 'video' ? <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-xs text-white">vídeo</span> : null}
              {item.status !== 'ready' ? (
                <span className="absolute inset-x-0 bottom-0 bg-black/60 text-center text-xs text-white">{STATUS_LABEL[item.status]}</span>
              ) : null}
            </label>
            {item.faceIndexing === 'unsupported' ? <p className="text-xs text-amber-700">Sem reconhecimento facial</p> : null}
            {item.status === 'error' ? (
              <button type="button" className="text-xs underline" onClick={() => retry(item.id)} disabled={pending}>
                Tentar de novo
              </button>
            ) : null}
            <select
              aria-label={`Dia de ${item.originalName}`}
              value={item.takenOn}
              onChange={event => run(() => updateMediaDay(eventId, item.id, event.target.value))}
              className="w-full rounded border border-gray-300 text-xs"
            >
              {(days.includes(item.takenOn) ? days : [item.takenOn, ...days]).map(d => (
                <option key={d} value={d}>
                  {formatDayMonth(d)}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
      {items.length === 0 ? <p className="text-sm text-gray-600">Nenhuma foto enviada ainda.</p> : null}
      {canClose ? (
        <div className="border-t pt-4">
          <Button
            type="button"
            variant="danger"
            disabled={pending}
            onClick={() => {
              if (confirm('Excluir TODAS as fotos e vídeos e encerrar o evento? As vendas continuam registradas.')) {
                run(() => closeEventAndDeleteMedia(eventId))
              }
            }}
          >
            Excluir todas as fotos e encerrar o evento
          </Button>
        </div>
      ) : null}
    </div>
  )
}
