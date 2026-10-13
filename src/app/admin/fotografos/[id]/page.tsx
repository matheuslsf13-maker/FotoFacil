import { notFound } from 'next/navigation'
import { ActionForm } from '@/components/action-form'
import { Card, Field, Input, PageTitle } from '@/components/ui'
import { photographerPhotoUrl } from '@/lib/photographers/photo'
import { createClient } from '@/lib/supabase/server'
import { updatePhotographer } from '../actions'
import { PhotographerFields } from '../photographer-fields'

export default async function EditPhotographerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: p } = await supabase.from('photographers').select('*').eq('id', id).maybeSingle()
  if (!p) notFound()
  const photoUrl = photographerPhotoUrl(p.photo_path)

  return (
    <div className="space-y-4">
      <PageTitle>{p.name}</PageTitle>
      <Card>
        <ActionForm action={updatePhotographer.bind(null, id)} submitLabel="Salvar">
          {photoUrl ? <img src={photoUrl} alt="" className="h-20 w-20 rounded-full object-cover" /> : null}
          <Field label="Foto">
            <Input name="photo" type="file" accept="image/*" />
          </Field>
          <PhotographerFields
            defaults={{
              name: p.name,
              whatsapp: p.whatsapp,
              priceCents: p.default_price_cents,
              commissionType: p.commission_type,
              commissionValue: p.commission_value,
            }}
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={p.active} /> Ativo
          </label>
        </ActionForm>
      </Card>
    </div>
  )
}
