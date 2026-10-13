import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

export const PUBLIC_BUCKET = 'public-assets'

export async function uploadPhotographerPhoto(photographerId: string, file: File): Promise<string> {
  if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) {
    throw new Error('Envie uma imagem de até 5 MB.')
  }
  const path = `photographers/${photographerId}-${Date.now()}`
  const { error } = await createAdminClient().storage.from(PUBLIC_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: true,
  })
  if (error) throw new Error('Não foi possível enviar a foto.')
  return path
}

export function photographerPhotoUrl(path: string | null): string | null {
  if (!path) return null
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${PUBLIC_BUCKET}/${path}`
}
