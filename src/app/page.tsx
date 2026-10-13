import Link from 'next/link'
import { Card } from '@/components/ui'
import { formatDate, todayInSaoPaulo } from '@/lib/domain/dates'
import { photographerPhotoUrl } from '@/lib/photographers/photo'
import { listActiveEvents } from '@/lib/public/queries'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const events = await listActiveEvents(createAdminClient(), todayInSaoPaulo())
  return (
    <div className="space-y-4">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">FotoFácil</h1>
        <p className="text-gray-600">Escolha o seu evento para encontrar suas fotos.</p>
      </div>
      {events.map(event => {
        const photo = photographerPhotoUrl(event.photographer.photo_path)
        return (
          <Link key={event.id} href={`/e/${event.slug}`} className="block">
            <Card className="flex items-center gap-3 hover:ring-pink-400">
              {photo ? (
                <img src={photo} alt="" className="h-12 w-12 rounded-full object-cover" />
              ) : (
                <div className="h-12 w-12 rounded-full bg-gray-200" />
              )}
              <div>
                <p className="font-medium">{event.name}</p>
                <p className="text-sm text-gray-600">
                  {event.photographer.name} · {formatDate(event.start_date)}
                </p>
              </div>
            </Card>
          </Link>
        )
      })}
      {events.length === 0 ? <p className="text-center text-sm text-gray-600">Nenhum evento disponível agora.</p> : null}
    </div>
  )
}
