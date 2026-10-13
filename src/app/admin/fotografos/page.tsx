import Link from 'next/link'
import { ActionForm } from '@/components/action-form'
import { Card, Field, Input, PageTitle } from '@/components/ui'
import { describeCommission } from '@/lib/domain/commission'
import { formatBRL } from '@/lib/domain/money'
import { createClient } from '@/lib/supabase/server'
import { createPhotographer } from './actions'
import { PhotographerFields } from './photographer-fields'

export default async function PhotographersPage() {
  const supabase = await createClient()
  const [{ data: photographers }, { data: settings }] = await Promise.all([
    supabase
      .from('photographers')
      .select('id, name, default_price_cents, commission_type, commission_value, active')
      .order('name'),
    supabase.from('settings').select('default_commission_type, default_commission_value').eq('id', 1).single(),
  ])

  return (
    <div className="space-y-6">
      <PageTitle>Fotógrafos</PageTitle>
      <Card>
        {photographers?.length ? (
          <ul className="divide-y">
            {photographers.map(p => (
              <li key={p.id} className="py-2">
                <Link href={`/admin/fotografos/${p.id}`} className="font-medium underline">
                  {p.name}
                </Link>
                {!p.active && <span className="ml-2 text-xs text-gray-500">(inativo)</span>}
                <p className="text-sm text-gray-600">
                  {formatBRL(p.default_price_cents)} · comissão {describeCommission(p.commission_type, p.commission_value)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-600">Nenhum fotógrafo cadastrado.</p>
        )}
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold">Novo fotógrafo</h2>
        <ActionForm action={createPhotographer} submitLabel="Criar fotógrafo">
          <PhotographerFields
            defaults={{ commissionType: settings?.default_commission_type ?? 'percent', commissionValue: settings?.default_commission_value ?? 1000 }}
          />
          <Field label="E-mail de login">
            <Input name="email" type="email" required />
          </Field>
          <Field label="Senha inicial">
            <Input name="password" type="password" minLength={8} required />
          </Field>
        </ActionForm>
      </Card>
    </div>
  )
}
