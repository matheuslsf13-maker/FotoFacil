import Link from 'next/link'
import { ActionForm } from '@/components/action-form'
import { Button, Card, Field, Input, PageTitle } from '@/components/ui'
import { maskPhone, normalizePhone } from '@/lib/domain/phone'
import { createClient } from '@/lib/supabase/server'
import { createClientRecord } from './actions'

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = '' } = await searchParams
  const supabase = await createClient()
  const phone = normalizePhone(q)
  let query = supabase.from('clients').select('id, full_name, phone_e164').order('full_name').limit(50)
  if (phone) query = query.eq('phone_e164', phone)
  else if (q.trim().length >= 2) query = query.ilike('full_name', `%${q.trim()}%`)
  const { data: clients } = await query

  return (
    <div className="space-y-6">
      <PageTitle>Clientes</PageTitle>
      <form className="flex gap-2">
        <Input name="q" defaultValue={q} placeholder="Nome ou celular" />
        <Button type="submit" variant="secondary">
          Buscar
        </Button>
      </form>
      <Card>
        <ul className="divide-y">
          {(clients ?? []).map(c => (
            <li key={c.id} className="flex justify-between py-2">
              <Link href={`/admin/clientes/${c.id}`} className="underline">
                {c.full_name}
              </Link>
              <span className="text-sm text-gray-600">{maskPhone(c.phone_e164)}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold">Nova cliente</h2>
        <ActionForm action={createClientRecord} submitLabel="Cadastrar">
          <Field label="Nome completo">
            <Input name="fullName" required />
          </Field>
          <Field label="Celular">
            <Input name="phone" type="tel" required />
          </Field>
        </ActionForm>
      </Card>
    </div>
  )
}
