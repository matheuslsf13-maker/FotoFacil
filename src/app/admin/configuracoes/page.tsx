import QRCode from 'qrcode'
import { ActionForm } from '@/components/action-form'
import { Card, Field, Input, PageTitle, Select } from '@/components/ui'
import { formatCommissionInput } from '@/lib/domain/commission'
import { createClient } from '@/lib/supabase/server'
import { updateSettings } from './actions'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: s } = await supabase.from('settings').select('*').eq('id', 1).single()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const qr = await QRCode.toDataURL(siteUrl, { width: 512, margin: 1 })

  return (
    <div className="space-y-6">
      <PageTitle>Configurações</PageTitle>
      <Card>
        <ActionForm action={updateSettings} submitLabel="Salvar configurações">
          <Field label="Prazo padrão de exclusão (dias)">
            <Input name="defaultRetentionDays" type="number" min={1} max={365} defaultValue={s.default_retention_days} />
          </Field>
          <Field label="Prazo máximo de exclusão (dias)">
            <Input name="maxRetentionDays" type="number" min={1} max={365} defaultValue={s.max_retention_days} />
          </Field>
          <Field label="Tipo de comissão padrão (novos fotógrafos)">
            <Select name="commissionType" defaultValue={s.default_commission_type}>
              <option value="percent">Percentual (%)</option>
              <option value="fixed">Valor fixo por venda (R$)</option>
            </Select>
          </Field>
          <Field label="Comissão padrão">
            <Input
              name="commissionValue"
              defaultValue={formatCommissionInput(s.default_commission_type, s.default_commission_value)}
            />
          </Field>
          <Field label="Semelhança mínima do reconhecimento (50–99)" hint="Mais alto = menos fotos erradas, mas pode esconder fotos certas.">
            <Input name="faceMatchThreshold" type="number" min={50} max={99} defaultValue={s.face_match_threshold} />
          </Field>
          <Field label="Buscas por dia por cliente">
            <Input name="dailySearchLimit" type="number" min={1} max={100} defaultValue={s.daily_search_limit} />
          </Field>
        </ActionForm>
      </Card>
      <Card className="space-y-2 text-center">
        <h2 className="font-semibold">QR code do link universal</h2>
        <p className="text-sm text-gray-600">{siteUrl}</p>
        <img src={qr} alt="QR code do FotoFácil" className="mx-auto h-48 w-48" />
        <a href={qr} download="fotofacil-qrcode.png" className="text-sm underline">
          Baixar QR code
        </a>
      </Card>
    </div>
  )
}
