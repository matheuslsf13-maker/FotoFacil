import Link from 'next/link'
import { Button, Card, PageTitle, Select } from '@/components/ui'
import { formatDate, todayInSaoPaulo } from '@/lib/domain/dates'
import { isEventAvailable } from '@/lib/domain/events'
import { one } from '@/lib/supabase/embed'
import { createClient } from '@/lib/supabase/server'

export default async function AdminEventsPage({ searchParams }: { searchParams: Promise<{ fotografo?: string }> }) {
  const { fotografo = '' } = await searchParams
  const supabase = await createClient()
  let query = supabase
    .from('events')
    .select('id, name, start_date, status, expires_at, photographers(name)')
    .order('start_date', { ascending: false })
    .limit(200)
  if (fotografo) query = query.eq('photographer_id', fotografo)
  const [{ data: events }, { data: photographers }] = await Promise.all([
    query,
    supabase.from('photographers').select('id, name').order('name'),
  ])
  const today = todayInSaoPaulo()

  return (
    <div className="space-y-4">
      <PageTitle>Eventos</PageTitle>
      <form className="flex gap-2">
        <Select name="fotografo" defaultValue={fotografo} aria-label="Fotógrafo">
          <option value="">Todos os fotógrafos</option>
          {(photographers ?? []).map(p => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </form>
      <Card>
        <ul className="divide-y">
          {(events ?? []).map(event => (
            <li key={event.id} className="py-2">
              <Link href={`/admin/eventos/${event.id}`} className="font-medium underline">
                {event.name}
              </Link>
              <p className="text-sm text-gray-600">
                {one(event.photographers)?.name} · {formatDate(event.start_date)} ·{' '}
                {isEventAvailable(event, today) ? `ativo até ${formatDate(event.expires_at)}` : 'encerrado'}
              </p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
