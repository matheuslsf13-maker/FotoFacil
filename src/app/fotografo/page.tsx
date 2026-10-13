import Link from 'next/link'
import { Card, PageTitle, buttonClass } from '@/components/ui'
import { requirePhotographer } from '@/lib/auth/guards'
import { formatDate, todayInSaoPaulo } from '@/lib/domain/dates'
import { expiryWarning, isEventAvailable } from '@/lib/domain/events'
import { createClient } from '@/lib/supabase/server'

export default async function PhotographerHome() {
  const { photographerId } = await requirePhotographer()
  const supabase = await createClient()
  const { data: events } = await supabase
    .from('events')
    .select('id, name, start_date, end_date, status, expires_at')
    .eq('photographer_id', photographerId)
    .order('start_date', { ascending: false })
  const today = todayInSaoPaulo()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PageTitle>Meus eventos</PageTitle>
        <Link href="/fotografo/eventos/novo" className={buttonClass('primary')}>
          Novo evento
        </Link>
      </div>
      {(events ?? []).map(event => {
        const warning = expiryWarning(event, today)
        return (
          <Card key={event.id}>
            <Link href={`/fotografo/eventos/${event.id}`} className="font-medium underline">
              {event.name}
            </Link>
            <p className="text-sm text-gray-600">
              {formatDate(event.start_date)} a {formatDate(event.end_date)} ·{' '}
              {isEventAvailable(event, today) ? `fotos até ${formatDate(event.expires_at)}` : 'encerrado'}
            </p>
            {warning ? <p className="mt-1 text-sm text-amber-700">{warning}</p> : null}
          </Card>
        )
      })}
      {events?.length ? null : <p className="text-sm text-gray-600">Nenhum evento ainda.</p>}
    </div>
  )
}
