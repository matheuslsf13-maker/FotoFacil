'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import type { ActionState } from '@/lib/action-state'
import { getSessionProfile } from '@/lib/auth/session'
import { todayInSaoPaulo } from '@/lib/domain/dates'
import { isEventAvailable } from '@/lib/domain/events'
import { errorMessage } from '@/lib/errors'
import { framePath, MEDIA_BUCKET, mediaPaths } from '@/lib/media/paths'
import { isValidUploadRequest, type UploadRequest } from '@/lib/media/upload-request'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export interface SignedUpload {
  path: string
  token: string
}

export interface UploadTicket {
  mediaId: string
  full: SignedUpload
  thumb: SignedUpload
  frames: SignedUpload[]
}

export async function createUpload(eventId: string, req: UploadRequest): Promise<{ ticket: UploadTicket } | { error: string }> {
  if (!(await getSessionProfile())) return { error: 'Sessão expirada. Entre de novo.' }
  if (!isValidUploadRequest(req)) return { error: 'Arquivo inválido.' }
  const supabase = await createClient()
  const { data: event } = await supabase.from('events').select('id, status, expires_at').eq('id', eventId).maybeSingle()
  if (!event) return { error: 'Evento não encontrado.' }
  if (!isEventAvailable(event, todayInSaoPaulo())) return { error: 'Este evento está encerrado.' }

  const mediaId = randomUUID()
  const paths = mediaPaths(eventId, mediaId, req.type, req.ext)
  const { error } = await supabase.from('media').insert({
    id: mediaId,
    event_id: eventId,
    type: req.type,
    original_name: req.originalName.slice(0, 200),
    storage_path: paths.full,
    thumb_path: paths.thumb,
    taken_on: req.takenOn,
    width: req.width || null,
    height: req.height || null,
    duration_s: req.durationS,
    frame_count: req.frameCount,
    face_indexing: req.faceIndexing,
  })
  if (error) return { error: errorMessage(error) }

  const storage = createAdminClient().storage.from(MEDIA_BUCKET)
  const sign = async (path: string): Promise<SignedUpload> => {
    const { data, error: signError } = await storage.createSignedUploadUrl(path, { upsert: true })
    if (signError || !data) throw new Error('Não foi possível preparar o envio.')
    return { path, token: data.token }
  }
  const frames = await Promise.all(Array.from({ length: req.frameCount }, (_, i) => sign(framePath(eventId, mediaId, i + 1))))
  return { ticket: { mediaId, full: await sign(paths.full), thumb: await sign(paths.thumb), frames } }
}

export async function updateMediaDay(eventId: string, mediaId: string, day: string): Promise<ActionState> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { error: 'Data inválida.' }
  const supabase = await createClient()
  const { data, error } = await supabase.from('media').update({ taken_on: day }).eq('id', mediaId).eq('event_id', eventId).select('id')
  if (error) return { error: errorMessage(error) }
  if (!data?.length) return { error: 'Foto não encontrada.' }
  revalidatePath(`/fotografo/eventos/${eventId}`)
  return { error: null, ok: true }
}
