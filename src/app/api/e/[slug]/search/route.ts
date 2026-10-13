import { NextResponse } from 'next/server'
import { getClientRegistrationId } from '@/lib/client-session/cookie'
import { getFaceProvider } from '@/lib/faces'
import { getPublicEvent } from '@/lib/public/queries'
import { searchClientMedia } from '@/lib/search/search'
import { createSupabaseSearchRepo } from '@/lib/search/search-repo'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 30
const MAX_SELFIE_BYTES = 4_000_000

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const db = createAdminClient()
  const event = await getPublicEvent(db, slug)
  if (!event) return NextResponse.json({ ok: false, reason: 'not_found' }, { status: 404 })
  const registrationId = await getClientRegistrationId(event.id)
  if (!registrationId) return NextResponse.json({ ok: false, reason: 'not_found' }, { status: 401 })

  const form = await request.formData()
  const selfie = form.get('selfie')
  if (!(selfie instanceof File) || selfie.size === 0 || selfie.size > MAX_SELFIE_BYTES) {
    return NextResponse.json({ ok: false, reason: 'no_face' }, { status: 422 })
  }
  const outcome = await searchClientMedia(
    {
      registrationId,
      selfie: new Uint8Array(await selfie.arrayBuffer()),
      consent: form.get('consent') === 'true',
      now: new Date(),
    },
    { repo: createSupabaseSearchRepo(db), faces: getFaceProvider() },
  )
  return NextResponse.json(outcome, { status: outcome.ok ? 200 : 422 })
}
