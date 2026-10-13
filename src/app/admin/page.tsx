import { Card, Input, PageTitle, Button } from '@/components/ui'
import { monthRange, salesByPhotographer, summarizeSales, type SaleRow } from '@/lib/domain/dashboard'
import { formatDate, todayInSaoPaulo } from '@/lib/domain/dates'
import { formatBRL } from '@/lib/domain/money'
import { one } from '@/lib/supabase/embed'
import { createClient } from '@/lib/supabase/server'

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { mes = '' } = await searchParams
  const month = /^\d{4}-\d{2}$/.test(mes) ? mes : todayInSaoPaulo().slice(0, 7)
  const { startIso, endIso } = monthRange(month)
  const supabase = await createClient()
  const [{ data: sales }, { data: undos }] = await Promise.all([
    supabase
      .from('registrations')
      .select('price_cents, commission_cents, payment_method, events(name, photographers(name))')
      .eq('status', 'paid')
      .gte('paid_at', startIso)
      .lt('paid_at', endIso),
    supabase
      .from('registration_log')
      .select('id, action, created_at, registrations(clients(full_name), events(name))')
      .in('action', ['undone', 'admin_undo'])
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .order('created_at', { ascending: false }),
  ])
  const rows: SaleRow[] = (sales ?? []).map(sale => ({
    price_cents: sale.price_cents,
    commission_cents: sale.commission_cents,
    payment_method: sale.payment_method,
    photographer_name: one(one(sale.events)?.photographers)?.name ?? '',
  }))
  const total = summarizeSales(rows)
  const stats = [
    ['Vendas', String(total.count)],
    ['Faturado pelos fotógrafos', formatBRL(total.totalCents)],
    ['Comissão já recebida (PIX)', formatBRL(total.commissionPixCents)],
    ['Comissão a cobrar (manual)', formatBRL(total.commissionManualCents)],
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle>Painel</PageTitle>
        <form className="flex gap-2">
          <Input type="month" name="mes" defaultValue={month} aria-label="Mês" />
          <Button type="submit" variant="secondary">
            Ver
          </Button>
        </form>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {stats.map(([label, value]) => (
          <Card key={label}>
            <p className="text-xs text-gray-600">{label}</p>
            <p className="text-xl font-semibold">{value}</p>
          </Card>
        ))}
      </div>
      <Card>
        <h2 className="mb-2 font-semibold">Por fotógrafo</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-gray-600">
            <tr>
              <th>Fotógrafo</th>
              <th>Vendas</th>
              <th>Total</th>
              <th>A cobrar</th>
            </tr>
          </thead>
          <tbody>
            {salesByPhotographer(rows).map(row => (
              <tr key={row.name} className="border-t">
                <td className="py-1">{row.name}</td>
                <td>{row.count}</td>
                <td>{formatBRL(row.totalCents)}</td>
                <td>{formatBRL(row.commissionManualCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold">Alertas: confirmações desfeitas</h2>
        {undos?.length ? (
          <ul className="divide-y text-sm">
            {undos.map(undo => (
              <li key={undo.id} className="py-1">
                {formatDate(undo.created_at.slice(0, 10))} · {one(one(undo.registrations)?.events)?.name} · {one(one(undo.registrations)?.clients)?.full_name} ·{' '}
                {undo.action === 'admin_undo' ? 'pelo admin' : 'pelo fotógrafo'}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-600">Nenhuma confirmação desfeita neste mês.</p>
        )}
      </Card>
    </div>
  )
}
