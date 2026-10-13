import { notFound } from 'next/navigation'
import { Card, PageTitle } from '@/components/ui'
import { formatDate, todayInSaoPaulo } from '@/lib/domain/dates'
import { isEventAvailable } from '@/lib/domain/events'
import { buildNameList } from '@/lib/domain/names'
import { photographerPhotoUrl } from '@/lib/photographers/photo'
import { getPublicEvent, listEventNames } from '@/lib/public/queries'
import { createAdminClient } from '@/lib/supabase/admin'
import { NameList } from './name-list'

export const dynamic = 'force-dynamic'

export default async function EventEntryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const db = createAdminClient()
  const event = await getPublicEvent(db, slug)
  if (!event) notFound()
  const photo = photographerPhotoUrl(event.photographer.photo_path)
  const available = isEventAvailable(event, todayInSaoPaulo())

  return (
    <div className="space-y-4">
      <Card className="flex items-center gap-3">
        {photo ? <img src={photo} alt="" className="h-14 w-14 rounded-full object-cover" /> : null}
        <div>
          <PageTitle>{event.name}</PageTitle>
          <p className="text-sm text-gray-600">Fotos de {event.photographer.name}</p>
          {available ? <p className="text-sm text-gray-600">Fotos disponíveis até {formatDate(event.expires_at)}</p> : null}
        </div>
      </Card>
      {available ? (
        <>
          <h2 className="font-medium">Toque no seu nome</h2>
          <NameList slug={slug} items={buildNameList(await listEventNames(db, event.id))} />
        </>
      ) : (
        <Card>
          <p>As fotos deste evento não estão mais disponíveis.</p>
        </Card>
      )}
    </div>
  )
}
