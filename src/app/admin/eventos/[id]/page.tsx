import { notFound } from 'next/navigation'
import { PageTitle } from '@/components/ui'
import { RegistrationList, type RegistrationItem } from '@/app/fotografo/eventos/[id]/pulseiras/registration-list'
import { MediaTab } from '@/app/fotografo/eventos/[id]/fotos/media-tab'
import { formatDate } from '@/lib/domain/dates'
import { maskPhone } from '@/lib/domain/phone'
import { canAdminUndo } from '@/lib/domain/registrations'
import { one } from '@/lib/supabase/embed'
import { createClient } from '@/lib/supabase/server'

export default async function AdminEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const [{ data: event }, { data: registrations }] = await Promise.all([
    supabase.from('events').select('*, photographers(name)').eq('id', id).maybeSingle(),
    supabase
      .from('registrations')
      .select('id, status, payment_method, clients(full_name, phone_e164), settlements(status)')
      .eq('event_id', id)
      .order('delivered_at', { ascending: false }),
  ])
  if (!event) notFound()
  const items: RegistrationItem[] = (registrations ?? []).map(r => ({
    id: r.id,
    fullName: one(r.clients)?.full_name ?? '',
    maskedPhone: maskPhone(one(r.clients)?.phone_e164 ?? ''),
    status: r.status,
    paymentMethod: r.payment_method,
    canUndo: canAdminUndo({ status: r.status, payment_method: r.payment_method, settlement_status: one(r.settlements)?.status ?? null }),
  }))

  return (
    <div className="space-y-6">
      <div>
        <PageTitle>{event.name}</PageTitle>
        <p className="text-sm text-gray-600">
          {one(event.photographers)?.name} · {formatDate(event.start_date)} a {formatDate(event.end_date)} · fotos até{' '}
          {formatDate(event.expires_at)} · {event.status === 'active' ? 'ativo' : 'encerrado'}
        </p>
      </div>
      <section className="space-y-2">
        <h2 className="font-semibold">Pulseiras e pagamentos</h2>
        <RegistrationList eventId={id} items={items} />
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">Fotos e vídeos</h2>
        <MediaTab event={event} />
      </section>
    </div>
  )
}
