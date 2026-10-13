'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { SubmitButton } from '@/components/submit-button'
import { Button, Card, ErrorText, Field, Input } from '@/components/ui'
import { initialActionState } from '@/lib/action-state'
import { WRISTBAND_TERMS_LABEL } from '@/lib/legal'
import { deliverToClient, registerAndDeliver, searchClients, type ClientSearchResult } from './actions'

export function WristbandPanel({ eventId, canDeliver }: { eventId: string; canDeliver: boolean }) {
  const [terms, setTerms] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ClientSearchResult[]>([])
  const [searched, setSearched] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [formState, formAction] = useActionState(registerAndDeliver.bind(null, eventId), initialActionState)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setSearched(false)
      return
    }
    const timer = setTimeout(() => {
      searchClients(q)
        .then(found => {
          setResults(found)
          setSearched(true)
        })
        .catch(() => setResults([]))
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    if (formState.ok) {
      setShowNew(false)
      setQuery('')
      setSuccess('Pulseira entregue!')
    }
  }, [formState])

  function deliver(clientId: string) {
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      const result = await deliverToClient(eventId, clientId, terms)
      if (result.error) {
        setError(result.error)
        return
      }
      setSuccess('Pulseira entregue!')
      setQuery('')
    })
  }

  if (!canDeliver) {
    return (
      <Card>
        <p className="text-sm text-gray-600">Este evento está encerrado: não é possível entregar novas pulseiras.</p>
      </Card>
    )
  }

  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">Entregar pulseira</h2>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} />
        {WRISTBAND_TERMS_LABEL}
      </label>
      <Field label="Buscar cliente (nome ou celular)">
        <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Ex.: Ana ou 71 99123-4567" />
      </Field>
      {results.length > 0 ? (
        <ul className="divide-y">
          {results.map(client => (
            <li key={client.id} className="flex items-center justify-between gap-2 py-2">
              <div>
                <p className="font-medium">{client.fullName}</p>
                <p className="text-xs text-gray-500">{client.maskedPhone}</p>
              </div>
              <Button type="button" onClick={() => deliver(client.id)} disabled={pending || !terms}>
                Entregar pulseira
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {searched && results.length === 0 ? <p className="text-sm text-gray-600">Nenhuma cliente encontrada.</p> : null}
      <ErrorText>{error}</ErrorText>
      {success ? <p className="text-sm text-green-700">{success}</p> : null}
      <Button type="button" variant="secondary" onClick={() => setShowNew(v => !v)}>
        Cadastrar nova cliente
      </Button>
      {showNew ? (
        <form action={formAction} className="space-y-3 border-t pt-3">
          <input type="hidden" name="terms" value={terms ? 'on' : ''} />
          <Field label="Nome completo">
            <Input name="fullName" required />
          </Field>
          <Field label="Celular">
            <Input name="phone" type="tel" required />
          </Field>
          <ErrorText>{formState.error}</ErrorText>
          <SubmitButton pendingText="Salvando…">Cadastrar e entregar pulseira</SubmitButton>
        </form>
      ) : null}
    </Card>
  )
}
