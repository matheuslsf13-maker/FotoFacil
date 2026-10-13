import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Card, PageTitle } from '@/components/ui'
import { getClientRegistrationId } from '@/lib/client-session/cookie'
import { displayName } from '@/lib/domain/names'
import { getPublicEvent, getRegistrationForAccess } from '@/lib/public/queries'
import { createAdminClient } from '@/lib/supabase/admin'
import { AccessForm } from './access-form'

export const dynamic = 'force-dynamic'

export default async function AccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ r?: string }>
}) {
  const { slug } = await params
  const { r = '' } = await searchParams
  const db = createAdminClient()
  const event = await getPublicEvent(db, slug)
  if (!event) notFound()
  const registration = await getRegistrationForAccess(db, r)
  if (!registration || registration.event_id !== event.id) redirect(`/e/${slug}`)
  if ((await getClientRegistrationId(event.id)) === registration.id) redirect(`/e/${slug}/minhas-fotos`)

  return (
    <div className="space-y-4">
      <PageTitle>Olá, {displayName(registration.full_name)}!</PageTitle>
      <Card>
        <p className="mb-3 text-sm text-gray-600">Para confirmar que é você, digite os 4 últimos dígitos do seu celular.</p>
        <AccessForm slug={slug} registrationId={registration.id} />
      </Card>
      <Link href={`/e/${slug}`} className="text-sm underline">
        Não sou eu
      </Link>
    </div>
  )
}
