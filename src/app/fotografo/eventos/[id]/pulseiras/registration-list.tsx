'use client'

import { useState, useTransition } from 'react'
import { Button, Card, ErrorText } from '@/components/ui'
import type { ActionState } from '@/lib/action-state'
import { statusLabel, type PaymentMethod, type RegistrationStatus } from '@/lib/domain/registrations'
import { confirmPayment, undoPayment } from './actions'

export interface RegistrationItem {
  id: string
  fullName: string
  maskedPhone: string
  status: RegistrationStatus
  paymentMethod: PaymentMethod | null
  canUndo: boolean
}

const FILTERS = [
  ['all', 'Todas'],
  ['wristband', 'Pulseira entregue'],
  ['paid', 'Pagas'],
] as const

export function RegistrationList({ eventId, items }: { eventId: string; items: RegistrationItem[] }) {
  const [filter, setFilter] = useState<'all' | RegistrationStatus>('all')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const visible = items.filter(item => filter === 'all' || item.status === filter)

  function run(action: () => Promise<ActionState>) {
    startTransition(async () => {
      const result = await action()
      setError(result.error)
    })
  }

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap gap-2 text-sm">
        {FILTERS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-full px-3 py-1 ${filter === key ? 'bg-pink-600 text-white' : 'bg-gray-100'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <ErrorText>{error}</ErrorText>
      <ul className="divide-y">
        {visible.map(item => (
          <li key={item.id} data-testid="registration-row" className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div>
              <p className="font-medium">{item.fullName}</p>
              <p className="text-xs text-gray-500">
                {item.maskedPhone} · {statusLabel({ status: item.status, payment_method: item.paymentMethod })}
              </p>
            </div>
            <div className="flex gap-2">
              {item.status === 'wristband' ? (
                <Button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (confirm(`Confirmar o pagamento de ${item.fullName}?`)) run(() => confirmPayment(eventId, item.id))
                  }}
                >
                  Confirmar pagamento
                </Button>
              ) : null}
              {item.canUndo ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => {
                    if (confirm('Desfazer a confirmação de pagamento?')) run(() => undoPayment(eventId, item.id))
                  }}
                >
                  Desfazer
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {visible.length === 0 ? <p className="text-sm text-gray-600">Nenhuma pulseira aqui.</p> : null}
    </Card>
  )
}
