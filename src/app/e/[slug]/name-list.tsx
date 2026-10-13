'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Input } from '@/components/ui'
import { matchesNameFilter, type NameListItem } from '@/lib/domain/names'

export function NameList({ slug, items }: { slug: string; items: NameListItem[] }) {
  const [filter, setFilter] = useState('')
  const visible = items.filter(item => matchesNameFilter(item.label, filter))
  return (
    <div className="space-y-3">
      <Input value={filter} onChange={event => setFilter(event.target.value)} placeholder="Digite seu nome" aria-label="Buscar seu nome" />
      <ul className="grid grid-cols-2 gap-2">
        {visible.map(item => (
          <li key={item.registrationId}>
            <Link
              href={`/e/${slug}/acesso?r=${item.registrationId}`}
              className="block rounded-lg bg-white px-3 py-3 text-center shadow-sm ring-1 ring-gray-200 hover:ring-pink-400"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
      {visible.length === 0 ? <p className="text-sm text-gray-600">Nenhum nome encontrado.</p> : null}
    </div>
  )
}
