import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { MEDIA_BUCKET } from './paths'

export const SIGNED_URL_SECONDS = 600

export async function signMediaPaths(db: SupabaseClient, paths: string[]): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map()
  const { data, error } = await db.storage.from(MEDIA_BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS)
  if (error) throw new Error(error.message)
  const urls = new Map<string, string>()
  for (const item of data ?? []) if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl)
  return urls
}
