import { Card } from '@/components/ui'
import { todayInSaoPaulo } from '@/lib/domain/dates'
import { isEventAvailable, type EventAvailability } from '@/lib/domain/events'
import { formatBRL } from '@/lib/domain/money'
import { maskPhone } from '@/lib/domain/phone'
import { canPhotographerUndo, summarizeRegistrations } from '@/lib/domain/registrations'
import { one } from '@/lib/supabase/embed'
import { createClient } from '@/lib/supabase/server'
import { RegistrationList, type RegistrationItem } from './registration-list'
import { WristbandPanel } from './wristband-panel'

export async function WristbandsTab({ event }: { event: EventAvailability & { id: string } }) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('registrations')
    .select('id, status, payment_method, price_cents, first_access_at, settlement_id, clients(full_name, phone_e164)')
    .eq('event_id', event.id)
    .order('delivered_at', { ascending: false })
  const rows = data ?? []
  const summary = summarizeRegistrations(rows)
  const items: RegistrationItem[] = rows.map(r => ({
    id: r.id,
    fullName: one(r.clients)?.full_name ?? '',
    maskedPhone: maskPhone(one(r.clients)?.phone_e164 ?? ''),
    status: r.status,
    paymentMethod: r.payment_method,
    canUndo: canPhotographerUndo(r),
  }))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Card>
          <p className="text-2xl font-semibold">{summary.delivered}</p>
          <p className="text-xs text-gray-600">Pulseiras</p>
        </Card>
        <Card>
          <p className="text-2xl font-semibold">{summary.paid}</p>
          <p className="text-xs text-gray-600">Pagas</p>
        </Card>
        <Card>
          <p className="text-lg font-semibold">{formatBRL(summary.totalPaidCents)}</p>
          <p className="text-xs text-gray-600">Vendido</p>
        </Card>
      </div>
      <WristbandPanel eventId={event.id} canDeliver={isEventAvailable(event, todayInSaoPaulo())} />
      <RegistrationList eventId={event.id} items={items} />
    </div>
  )
}
