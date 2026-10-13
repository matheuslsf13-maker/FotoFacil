import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron'
import { getFaceProvider } from '@/lib/faces'
import { retryStuckMedia } from '@/lib/media/processing'
import { createSupabaseProcessingRepo } from '@/lib/media/processing-repo'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 60

export async function POST(request: Request) {
  if (!isCronAuthorized(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const retried = await retryStuckMedia(new Date(), {
    repo: createSupabaseProcessingRepo(createAdminClient()),
    faces: getFaceProvider(),
  })
  return NextResponse.json({ retried })
}
