import { Field, Input } from '@/components/ui'
import { centsToInput } from '@/lib/domain/money'

export interface EventDefaults {
  name: string
  startDate: string
  endDate: string
  priceCents: number
  retentionDays: number
}

export function EventFormFields({ defaults, maxRetentionDays }: { defaults: EventDefaults; maxRetentionDays: number }) {
  return (
    <>
      <Field label="Nome do evento">
        <Input name="name" defaultValue={defaults.name} required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Data de início">
          <Input name="startDate" type="date" defaultValue={defaults.startDate} required />
        </Field>
        <Field label="Data de término">
          <Input name="endDate" type="date" defaultValue={defaults.endDate} required />
        </Field>
      </div>
      <Field label="Preço do pacote (R$)">
        <Input name="price" inputMode="decimal" defaultValue={centsToInput(defaults.priceCents)} required />
      </Field>
      <Field
        label="Prazo de exclusão (dias)"
        hint={`As fotos ficam disponíveis até o término + este prazo. Máximo: ${maxRetentionDays} dias.`}
      >
        <Input name="retentionDays" type="number" min={1} max={maxRetentionDays} defaultValue={defaults.retentionDays} required />
      </Field>
    </>
  )
}
