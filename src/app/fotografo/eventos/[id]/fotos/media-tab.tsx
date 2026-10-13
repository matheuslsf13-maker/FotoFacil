import { todayInSaoPaulo } from '@/lib/domain/dates'
import { eventDays, isEventAvailable } from '@/lib/domain/events'
import { signMediaPaths } from '@/lib/media/signed-urls'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { MediaGrid, type GridItem } from './media-grid'
import { MediaUploader } from './media-uploader'

export async function MediaTab({
  event,
}: {
  event: { id: string; status: string; expires_at: string; start_date: string; end_date: string }
}) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('media')
    .select('id, type, taken_on, status, face_indexing, original_name, thumb_path')
    .eq('event_id', event.id)
    .is('deleted_at', null)
    .order('taken_on')
    .order('created_at')
  const rows = data ?? []
  const urls = await signMediaPaths(createAdminClient(), rows.filter(r => r.status !== 'uploading').map(r => r.thumb_path))
  const items: GridItem[] = rows.map(r => ({
    id: r.id,
    type: r.type,
    takenOn: r.taken_on,
    status: r.status,
    faceIndexing: r.face_indexing,
    originalName: r.original_name,
    thumbUrl: urls.get(r.thumb_path) ?? null,
  }))
  const days = [...new Set([...eventDays(event.start_date, event.end_date), ...items.map(i => i.takenOn)])].sort()
  const available = isEventAvailable(event, todayInSaoPaulo())

  return (
    <div className="space-y-4">
      {available ? <MediaUploader eventId={event.id} /> : <p className="text-sm text-gray-600">Evento encerrado: envio desativado.</p>}
      <MediaGrid eventId={event.id} items={items} days={days} canClose={available} />
    </div>
  )
}
