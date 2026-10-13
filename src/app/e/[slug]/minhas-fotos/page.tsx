import { notFound, redirect } from 'next/navigation'
import { Card, PageTitle } from '@/components/ui'
import { getClientRegistrationId } from '@/lib/client-session/cookie'
import { clientView, hasNewMedia } from '@/lib/domain/client-view'
import { formatDate, todayInSaoPaulo } from '@/lib/domain/dates'
import { isEventAvailable } from '@/lib/domain/events'
import { extOf, type GalleryItem } from '@/lib/domain/gallery'
import { displayName } from '@/lib/domain/names'
import { paymentRequestMessage, whatsappLink } from '@/lib/domain/whatsapp'
import { getClientRegistration, latestEventMediaAt, listClientMedia } from '@/lib/gallery/queries'
import { signMediaPaths } from '@/lib/media/signed-urls'
import { photographerPhotoUrl } from '@/lib/photographers/photo'
import { getPublicEvent } from '@/lib/public/queries'
import { createAdminClient } from '@/lib/supabase/admin'
import { FaceSearch } from './face-search'
import { Gallery } from './gallery'
import { PaymentNotice } from './payment-notice'

export const dynamic = 'force-dynamic'

export default async function MyPhotosPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ buscar?: string }>
}) {
  const { slug } = await params
  const { buscar } = await searchParams
  const db = createAdminClient()
  const event = await getPublicEvent(db, slug)
  if (!event) notFound()
  if (!isEventAvailable(event, todayInSaoPaulo())) {
    return (
      <Card>
        <p>As fotos deste evento não estão mais disponíveis.</p>
      </Card>
    )
  }
  const registrationId = await getClientRegistrationId(event.id)
  if (!registrationId) redirect(`/e/${slug}`)
  const registration = await getClientRegistration(db, registrationId)
  if (!registration || registration.event_id !== event.id) redirect(`/e/${slug}`)

  const whatsappUrl = whatsappLink(event.photographer.whatsapp, paymentRequestMessage(registration.full_name, event.name))
  const view = clientView({ status: registration.status, lastSearchAt: registration.last_search_at, forceSearch: buscar === '1' })
  const header = (
    <div>
      <PageTitle>{event.name}</PageTitle>
      <p className="text-sm text-gray-600">
        Olá, {displayName(registration.full_name)}! Fotos disponíveis até {formatDate(event.expires_at)}.
      </p>
    </div>
  )

  if (view === 'payment') {
    return (
      <div className="space-y-4">
        {header}
        <PaymentNotice
          eventName={event.name}
          priceCents={event.price_cents}
          photographerName={event.photographer.name}
          photographerPhotoUrl={photographerPhotoUrl(event.photographer.photo_path)}
          whatsappUrl={whatsappUrl}
        />
      </div>
    )
  }

  if (view === 'search') {
    return (
      <div className="space-y-4">
        {header}
        <FaceSearch slug={slug} needsConsent={!registration.face_consent_at} />
      </div>
    )
  }

  const rows = await listClientMedia(db, registration.id)
  const urls = await signMediaPaths(db, rows.flatMap(row => [row.thumb_path, row.storage_path]))
  const items: GalleryItem[] = rows.map(row => ({
    id: row.id,
    type: row.type,
    takenOn: row.taken_on,
    ext: extOf(row.storage_path),
    thumbUrl: urls.get(row.thumb_path) ?? '',
    fullUrl: urls.get(row.storage_path) ?? '',
  }))
  const newMedia = hasNewMedia(registration.last_search_at, await latestEventMediaAt(db, event.id))

  return (
    <div className="space-y-4">
      {header}
      <Gallery slug={slug} items={items} hasNewMedia={newMedia} whatsappUrl={whatsappUrl} />
    </div>
  )
}
