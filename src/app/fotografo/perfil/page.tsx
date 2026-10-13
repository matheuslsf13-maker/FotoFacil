import { ActionForm } from '@/components/action-form'
import { Card, Field, Input, PageTitle } from '@/components/ui'
import { requirePhotographer } from '@/lib/auth/guards'
import { describeCommission } from '@/lib/domain/commission'
import { centsToInput } from '@/lib/domain/money'
import { photographerPhotoUrl } from '@/lib/photographers/photo'
import { createClient } from '@/lib/supabase/server'
import { updateProfile } from './actions'

export default async function ProfilePage() {
  const { photographerId } = await requirePhotographer()
  const supabase = await createClient()
  const { data: me } = await supabase.from('photographers').select('*').eq('id', photographerId).single()
  const photoUrl = photographerPhotoUrl(me.photo_path)

  return (
    <div className="space-y-4">
      <PageTitle>Meu perfil</PageTitle>
      <Card>
        <ActionForm action={updateProfile} submitLabel="Salvar perfil">
          {photoUrl ? <img src={photoUrl} alt="" className="h-20 w-20 rounded-full object-cover" /> : null}
          <Field label="Foto" hint="Aparece para as clientes na lista de eventos.">
            <Input name="photo" type="file" accept="image/*" />
          </Field>
          <Field label="Nome">
            <Input name="name" defaultValue={me.name} required />
          </Field>
          <Field label="WhatsApp">
            <Input name="whatsapp" type="tel" defaultValue={me.whatsapp} required />
          </Field>
          <Field label="Preço padrão do pacote (R$)">
            <Input name="price" inputMode="decimal" defaultValue={centsToInput(me.default_price_cents)} required />
          </Field>
        </ActionForm>
        <p className="mt-4 text-sm text-gray-600">
          Comissão da plataforma: {describeCommission(me.commission_type, me.commission_value)} por venda (definida pelo
          administrador).
        </p>
      </Card>
    </div>
  )
}
