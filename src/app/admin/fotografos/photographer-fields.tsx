import { Field, Input, Select } from '@/components/ui'
import { formatCommissionInput, type CommissionType } from '@/lib/domain/commission'
import { centsToInput } from '@/lib/domain/money'

export interface PhotographerDefaults {
  name?: string
  whatsapp?: string
  priceCents?: number
  commissionType: CommissionType
  commissionValue: number
}

export function PhotographerFields({ defaults }: { defaults: PhotographerDefaults }) {
  return (
    <>
      <Field label="Nome">
        <Input name="name" defaultValue={defaults.name} required />
      </Field>
      <Field label="WhatsApp">
        <Input name="whatsapp" type="tel" defaultValue={defaults.whatsapp} required />
      </Field>
      <Field label="Preço padrão do pacote (R$)">
        <Input
          name="price"
          inputMode="decimal"
          defaultValue={defaults.priceCents ? centsToInput(defaults.priceCents) : ''}
          required
        />
      </Field>
      <Field label="Tipo de comissão">
        <Select name="commissionType" defaultValue={defaults.commissionType}>
          <option value="percent">Percentual (%)</option>
          <option value="fixed">Valor fixo por venda (R$)</option>
        </Select>
      </Field>
      <Field label="Comissão">
        <Input name="commissionValue" defaultValue={formatCommissionInput(defaults.commissionType, defaults.commissionValue)} required />
      </Field>
    </>
  )
}
