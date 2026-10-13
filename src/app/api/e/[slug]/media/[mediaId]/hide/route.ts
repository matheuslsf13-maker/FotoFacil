import { NextResponse } from 'next/server'
import { getClientRegistrationId } from '@/lib/client-session/cookie'
import { getPublicEvent } from '@/lib/public/queries'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(_request: Request, { params }: { params: Promise<{ slug: string; mediaId: string }> }) {
  const { slug, mediaId } = await params
  const db = createAdminClient()
  const event = await getPublicEvent(db, slug)
  if (!event) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const registrationId = await getClientRegistrationId(event.id)
  if (!registrationId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { error } = await db
    .from('client_matches')
    .update({ hidden: true })
    .eq('registration_id', registrationId)
    .eq('media_id', mediaId)
  if (error) return NextResponse.json({ error: 'failed' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
