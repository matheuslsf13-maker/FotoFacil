import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron'
import { todayInSaoPaulo } from '@/lib/domain/dates'
import { getFaceProvider } from '@/lib/faces'
import { expireEvents } from '@/lib/media/deletion'
import { createSupabaseDeletionRepo } from '@/lib/media/deletion-repo'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 60

export async function POST(request: Request) {
  if (!isCronAuthorized(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const expired = await expireEvents(todayInSaoPaulo(), {
    repo: createSupabaseDeletionRepo(createAdminClient()),
    faces: getFaceProvider(),
  })
  return NextResponse.json({ expired })
}
