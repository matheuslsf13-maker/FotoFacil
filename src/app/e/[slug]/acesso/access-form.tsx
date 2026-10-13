'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button, ErrorText, Field, Input } from '@/components/ui'

export function AccessForm({ slug, registrationId }: { slug: string; registrationId: string }) {
  const router = useRouter()
  const [last4, setLast4] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    const response = await fetch(`/api/e/${slug}/access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ registrationId, last4 }),
    })
    const body = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string }
    setPending(false)
    if (body.ok) router.push(`/e/${slug}/minhas-fotos`)
    else setError(body.error ?? 'Algo deu errado. Tente de novo.')
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Últimos 4 dígitos do celular">
        <Input
          value={last4}
          onChange={event => setLast4(event.target.value.replace(/\D/g, '').slice(0, 4))}
          inputMode="numeric"
          autoComplete="off"
          pattern="\d{4}"
          required
        />
      </Field>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" disabled={pending || last4.length !== 4}>
        {pending ? 'Conferindo…' : 'Entrar'}
      </Button>
    </form>
  )
}
