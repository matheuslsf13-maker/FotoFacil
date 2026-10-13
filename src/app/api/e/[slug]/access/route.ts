import { NextResponse } from 'next/server'
import { setClientSession } from '@/lib/client-session/cookie'
import { ACCESS_WINDOW_MS, isAccessBlocked } from '@/lib/domain/access'
import { phoneLast4 } from '@/lib/domain/phone'
import { clientIp } from '@/lib/http'
import { getPublicEvent, getRegistrationForAccess } from '@/lib/public/queries'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const body = (await request.json().catch(() => null)) as { registrationId?: string; last4?: string } | null
  if (!body?.registrationId || !/^\d{4}$/.test(body.last4 ?? '')) {
    return NextResponse.json({ error: 'Digite os 4 últimos dígitos do seu celular.' }, { status: 400 })
  }
  const db = createAdminClient()
  const event = await getPublicEvent(db, slug)
  const registration = await getRegistrationForAccess(db, body.registrationId)
  if (!event || !registration || registration.event_id !== event.id) {
    return NextResponse.json({ error: 'Cadastro não encontrado.' }, { status: 404 })
  }

  const ip = clientIp(request.headers)
  const since = new Date(Date.now() - ACCESS_WINDOW_MS).toISOString()
  const failures = (column: 'registration_id' | 'ip', value: string) =>
    db
      .from('access_attempts')
      .select('id', { count: 'exact', head: true })
      .eq(column, value)
      .eq('success', false)
      .gte('created_at', since)
  const [byRegistration, byIp] = await Promise.all([failures('registration_id', registration.id), failures('ip', ip)])
  if (isAccessBlocked(byRegistration.count ?? 0, byIp.count ?? 0)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde 15 minutos e tente de novo.' }, { status: 429 })
  }

  const success = phoneLast4(registration.phone_e164) === body.last4
  await db.from('access_attempts').insert({ registration_id: registration.id, ip, success })
  if (!success) return NextResponse.json({ error: 'Os dígitos não conferem.' }, { status: 401 })

  await setClientSession(event.id, registration.id)
  return NextResponse.json({ ok: true })
}
