import { ActionForm } from '@/components/action-form'
import { Button, Card, Field, Input, PageTitle, Select } from '@/components/ui'
import { formatDate, todayInSaoPaulo } from '@/lib/domain/dates'
import { formatBRL } from '@/lib/domain/money'
import { one } from '@/lib/supabase/embed'
import { createClient } from '@/lib/supabase/server'
import { createSettlementAction } from './actions'
import { MarkPaidButton } from './mark-paid-button'

function monthLabel(isoDate: string): string {
  return `${isoDate.slice(5, 7)}/${isoDate.slice(0, 4)}`
}

export default async function SettlementsPage({
  searchParams,
}: {
  searchParams: Promise<{ fotografo?: string; tipo?: string; evento?: string; mes?: string }>
}) {
  const params = await searchParams
  const photographerId = params.fotografo ?? ''
  const type: 'event' | 'month' = params.tipo === 'event' ? 'event' : 'month'
  const month = /^\d{4}-\d{2}$/.test(params.mes ?? '') ? params.mes! : todayInSaoPaulo().slice(0, 7)
  const eventId = params.evento ?? ''
  const supabase = await createClient()

  const [{ data: photographers }, { data: events }, { data: settlements }] = await Promise.all([
    supabase.from('photographers').select('id, name').order('name'),
    photographerId
      ? supabase.from('events').select('id, name, start_date').eq('photographer_id', photographerId).order('start_date', { ascending: false })
      : Promise.resolve({ data: [] as Array<{ id: string; name: string; start_date: string }> }),
    supabase
      .from('settlements')
      .select('id, period_type, month, sales_count, total_sales_cents, commission_pix_cents, commission_manual_cents, status, paid_at, photographers(name), events(name)')
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const input = {
    photographerId,
    type,
    eventId: type === 'event' ? eventId : null,
    month: type === 'month' ? `${month}-01` : null,
  }
  const ready = Boolean(photographerId) && (type === 'month' || Boolean(eventId))
  const preview = ready
    ? (
        await supabase.rpc('settlement_preview', {
          p_photographer_id: input.photographerId,
          p_period_type: input.type,
          p_event_id: input.eventId,
          p_month: input.month,
        })
      ).data?.[0]
    : null

  return (
    <div className="space-y-6">
      <PageTitle>Fechamentos</PageTitle>
      <Card className="space-y-4">
        <form className="grid gap-3 sm:grid-cols-2">
          <Field label="Fotógrafo">
            <Select name="fotografo" defaultValue={photographerId}>
              <option value="">Escolha…</option>
              {(photographers ?? []).map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Período">
            <Select name="tipo" defaultValue={type}>
              <option value="month">Mês</option>
              <option value="event">Evento</option>
            </Select>
          </Field>
          <Field label="Mês (fechamento mensal)">
            <Input type="month" name="mes" defaultValue={month} />
          </Field>
          <Field label="Evento (fechamento por evento)" hint="Escolha o fotógrafo e clique em Ver prévia para listar os eventos.">
            <Select name="evento" defaultValue={eventId}>
              <option value="">Escolha…</option>
              {(events ?? []).map(e => (
                <option key={e.id} value={e.id}>
                  {e.name} ({formatDate(e.start_date)})
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" variant="secondary">
            Ver prévia
          </Button>
        </form>
        {preview ? (
          <div className="space-y-1 border-t pt-4">
            <p>
              Vendas: {preview.sales_count} · Total vendido: {formatBRL(Number(preview.total_sales_cents))}
            </p>
            <p>Comissão já recebida (PIX): {formatBRL(Number(preview.commission_pix_cents))}</p>
            <p className="text-lg font-semibold">A cobrar do fotógrafo: {formatBRL(Number(preview.commission_manual_cents))}</p>
            <ActionForm action={createSettlementAction.bind(null, input)} submitLabel="Gerar fechamento" pendingText="Gerando…">
              <p className="text-sm text-gray-600">As vendas incluídas não entram em outro fechamento.</p>
            </ActionForm>
          </div>
        ) : null}
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold">Fechamentos gerados</h2>
        <ul className="divide-y text-sm">
          {(settlements ?? []).map(s => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div>
                <p className="font-medium">
                  {one(s.photographers)?.name} · {s.period_type === 'event' ? one(s.events)?.name : monthLabel(s.month)}
                </p>
                <p className="text-gray-600">
                  {s.sales_count} vendas · {formatBRL(Number(s.total_sales_cents))} · PIX recebido{' '}
                  {formatBRL(Number(s.commission_pix_cents))} · a cobrar {formatBRL(Number(s.commission_manual_cents))}
                </p>
                <p className="text-gray-600">{s.status === 'paid' ? `Pago em ${formatDate(s.paid_at.slice(0, 10))}` : 'Em aberto'}</p>
              </div>
              {s.status === 'open' ? <MarkPaidButton settlementId={s.id} /> : null}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
