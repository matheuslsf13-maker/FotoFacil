import { ActionForm } from '@/components/action-form'
import { Card, PageTitle } from '@/components/ui'
import { requirePhotographer } from '@/lib/auth/guards'
import { todayInSaoPaulo } from '@/lib/domain/dates'
import { createClient } from '@/lib/supabase/server'
import { createEvent } from '../actions'
import { EventFormFields } from '../event-form-fields'

export default async function NewEventPage() {
  const { photographerId } = await requirePhotographer()
  const supabase = await createClient()
  const [{ data: me }, { data: settings }] = await Promise.all([
    supabase.from('photographers').select('default_price_cents').eq('id', photographerId).single(),
    supabase.from('settings').select('default_retention_days, max_retention_days').eq('id', 1).single(),
  ])
  const today = todayInSaoPaulo()

  return (
    <div className="space-y-4">
      <PageTitle>Novo evento</PageTitle>
      <Card>
        <ActionForm action={createEvent} submitLabel="Criar evento" pendingText="Criando…">
          <EventFormFields
            defaults={{
              name: '',
              startDate: today,
              endDate: today,
              priceCents: me?.default_price_cents ?? 5000,
              retentionDays: settings?.default_retention_days ?? 30,
            }}
            maxRetentionDays={settings?.max_retention_days ?? 90}
          />
        </ActionForm>
      </Card>
    </div>
  )
}
