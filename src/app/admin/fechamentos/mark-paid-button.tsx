'use client'

import { useState, useTransition } from 'react'
import { Button, ErrorText } from '@/components/ui'
import { markSettlementPaid } from './actions'

export function MarkPaidButton({ settlementId }: { settlementId: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={() => {
          if (!confirm('Marcar este fechamento como pago?')) return
          startTransition(async () => setError((await markSettlementPaid(settlementId)).error))
        }}
      >
        Marcar como pago
      </Button>
      <ErrorText>{error}</ErrorText>
    </>
  )
}
