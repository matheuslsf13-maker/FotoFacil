import { notFound } from 'next/navigation'
import { ActionForm } from '@/components/action-form'
import { Card, Field, Input, PageTitle } from '@/components/ui'
import { formatDate } from '@/lib/domain/dates'
import { one } from '@/lib/supabase/embed'
import { createClient } from '@/lib/supabase/server'
import { updateClientRecord } from '../actions'

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const [{ data: client }, { data: registrations }] = await Promise.all([
    supabase.from('clients').select('id, full_name, phone_e164').eq('id', id).maybeSingle(),
    supabase
      .from('registrations')
      .select('id, status, payment_method, events(name, start_date)')
      .eq('client_id', id)
      .order('delivered_at', { ascending: false }),
  ])
  if (!client) notFound()

  return (
    <div className="space-y-4">
      <PageTitle>{client.full_name}</PageTitle>
      <Card>
        <ActionForm action={updateClientRecord.bind(null, id)} submitLabel="Salvar">
          <Field label="Nome completo">
            <Input name="fullName" defaultValue={client.full_name} required />
          </Field>
          <Field label="Celular">
            <Input name="phone" type="tel" defaultValue={client.phone_e164} required />
          </Field>
        </ActionForm>
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold">Eventos</h2>
        <ul className="divide-y text-sm">
          {(registrations ?? []).map(r => {
            const event = one(r.events)
            return (
              <li key={r.id} className="flex justify-between py-2">
                <span>
                  {event?.name} · {event ? formatDate(event.start_date) : ''}
                </span>
                <span>{r.status === 'paid' ? `Pago (${r.payment_method === 'pix' ? 'PIX' : 'manual'})` : 'Pulseira entregue'}</span>
              </li>
            )
          })}
        </ul>
      </Card>
    </div>
  )
}
