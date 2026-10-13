import { notFound } from 'next/navigation'
import { ActionForm } from '@/components/action-form'
import { Card, PageTitle } from '@/components/ui'
import { requirePhotographer } from '@/lib/auth/guards'
import { formatDate, todayInSaoPaulo } from '@/lib/domain/dates'
import { expiryWarning, isEventAvailable } from '@/lib/domain/events'
import { formatBRL } from '@/lib/domain/money'
import { createClient } from '@/lib/supabase/server'
import { updateEvent } from '../actions'
import { EventFormFields } from '../event-form-fields'
import { EventTabs } from './event-tabs'
import { MediaTab } from './fotos/media-tab'
import { WristbandsTab } from './pulseiras/wristbands-tab'

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ aba?: string }>
}) {
  const { id } = await params
  const { aba = 'pulseiras' } = await searchParams
  await requirePhotographer()
  const supabase = await createClient()
  const [{ data: event }, { data: settings }] = await Promise.all([
    supabase.from('events').select('*').eq('id', id).maybeSingle(),
    supabase.from('settings').select('max_retention_days').eq('id', 1).single(),
  ])
  if (!event) notFound()
  const today = todayInSaoPaulo()
  const warning = expiryWarning(event, today)

  return (
    <div className="space-y-4">
      <div>
        <PageTitle>{event.name}</PageTitle>
        <p className="text-sm text-gray-600">
          {formatDate(event.start_date)} a {formatDate(event.end_date)} · {formatBRL(event.price_cents)} ·{' '}
          {isEventAvailable(event, today) ? `fotos disponíveis até ${formatDate(event.expires_at)}` : 'encerrado'}
        </p>
      </div>
      {warning ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{warning}</p> : null}
      <EventTabs eventId={id} active={aba} />
      {aba === 'pulseiras' ? <WristbandsTab event={event} /> : null}
      {aba === 'fotos' ? <MediaTab event={event} /> : null}
      {aba === 'config' ? (
        <Card>
          <ActionForm action={updateEvent.bind(null, id)} submitLabel="Salvar">
            <EventFormFields
              defaults={{
                name: event.name,
                startDate: event.start_date,
                endDate: event.end_date,
                priceCents: event.price_cents,
                retentionDays: event.retention_days,
              }}
              maxRetentionDays={settings?.max_retention_days ?? 90}
            />
          </ActionForm>
        </Card>
      ) : null}
    </div>
  )
}
