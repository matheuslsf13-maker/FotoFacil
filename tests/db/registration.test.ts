import { afterAll, describe, expect, it } from 'vitest'
import {
  asUser,
  closePool,
  confirmManual,
  createAdmin,
  createClientRow,
  createEvent,
  createMedia,
  createPhotographer,
  deliver,
  pool,
  uniquePhone,
} from './helpers'

afterAll(closePool)

async function logActions(registrationId: string): Promise<string[]> {
  const { rows } = await pool.query(
    'select action from public.registration_log where registration_id = $1 order by created_at',
    [registrationId],
  )
  return rows.map(r => r.action)
}

describe('compute_commission', () => {
  it.each([
    [5000, 'percent', 1500, 750],
    [4990, 'percent', 1550, 773],
    [5000, 'fixed', 500, 500],
    [5000, 'fixed', 6000, 5000],
  ])('price %i, %s %i → %i', async (price, type, value, expected) => {
    const { rows } = await pool.query('select public.compute_commission($1, $2, $3) as c', [price, type, value])
    expect(rows[0].c).toBe(expected)
  })
})

describe('find_or_create_client', () => {
  it('returns the existing client for the same phone without renaming it', async () => {
    const { userId } = await createPhotographer()
    const phone = uniquePhone()
    const call = (name: string) =>
      asUser(userId, async c => (await c.query('select public.find_or_create_client($1, $2) as id', [name, phone])).rows[0].id)
    const first = await call('Ana   Souza')
    const second = await call('Outra Pessoa')
    expect(second).toBe(first)
    const { rows } = await pool.query('select full_name from public.clients where id = $1', [first])
    expect(rows[0].full_name).toBe('Ana Souza')
  })

  it('is not callable by anon', async () => {
    await expect(
      asUser(null, c => c.query("select public.find_or_create_client('Ana Souza', '+5571991230000')")),
    ).rejects.toThrow('permission denied')
  })
})

describe('deliver_wristband', () => {
  it('creates a registration with the event price frozen', async () => {
    const { userId, photographerId } = await createPhotographer()
    const eventId = await createEvent(photographerId, { priceCents: 6000 })
    const regId = await deliver(userId, eventId, await createClientRow())
    await pool.query('update public.events set price_cents = 9000 where id = $1', [eventId])
    const { rows } = await pool.query('select status, price_cents from public.registrations where id = $1', [regId])
    expect(rows[0]).toEqual({ status: 'wristband', price_cents: 6000 })
    expect(await logActions(regId)).toEqual(['delivered'])
  })

  it('fails cleanly on a double delivery and keeps a single registration', async () => {
    const { userId, photographerId } = await createPhotographer()
    const eventId = await createEvent(photographerId)
    const clientId = await createClientRow()
    const regId = await deliver(userId, eventId, clientId)
    await expect(deliver(userId, eventId, clientId)).rejects.toThrow('already_registered')
    const { rows } = await pool.query('select count(*)::int as n from public.registrations where event_id = $1', [eventId])
    expect(rows[0].n).toBe(1)
    expect(await logActions(regId)).toEqual(['delivered'])
  })

  it('requires terms acceptance', async () => {
    const { userId, photographerId } = await createPhotographer()
    const eventId = await createEvent(photographerId)
    const clientId = await createClientRow()
    await expect(
      asUser(userId, c => c.query('select public.deliver_wristband($1, $2, false)', [eventId, clientId])),
    ).rejects.toThrow('terms_required')
  })

  it('blocks other photographers', async () => {
    const a = await createPhotographer()
    const b = await createPhotographer()
    const eventId = await createEvent(a.photographerId)
    await expect(deliver(b.userId, eventId, await createClientRow())).rejects.toThrow('not_authorized')
  })

  it('blocks expired events', async () => {
    const { userId, photographerId } = await createPhotographer()
    const eventId = await createEvent(photographerId, { status: 'expired' })
    await expect(deliver(userId, eventId, await createClientRow())).rejects.toThrow('event_not_active')
  })
})

describe('confirm_manual_payment', () => {
  it('freezes the commission from the photographer settings at payment time', async () => {
    const { userId, photographerId } = await createPhotographer({ commissionType: 'percent', commissionValue: 1500 })
    const eventId = await createEvent(photographerId, { priceCents: 5000 })
    const regId = await deliver(userId, eventId, await createClientRow())
    await confirmManual(userId, regId)
    await pool.query('update public.photographers set commission_value = 3000 where id = $1', [photographerId])
    const { rows } = await pool.query(
      'select status, payment_method, commission_cents, confirmed_by from public.registrations where id = $1',
      [regId],
    )
    expect(rows[0]).toEqual({ status: 'paid', payment_method: 'manual', commission_cents: 750, confirmed_by: userId })
  })

  it('rejects a second confirmation and logs once', async () => {
    const { userId, photographerId } = await createPhotographer()
    const eventId = await createEvent(photographerId)
    const regId = await deliver(userId, eventId, await createClientRow())
    await confirmManual(userId, regId)
    await expect(confirmManual(userId, regId)).rejects.toThrow('invalid_state')
    expect(await logActions(regId)).toEqual(['delivered', 'confirmed_manual'])
  })
})

describe('undo_manual_payment', () => {
  async function paidRegistration() {
    const photographer = await createPhotographer()
    const eventId = await createEvent(photographer.photographerId)
    const regId = await deliver(photographer.userId, eventId, await createClientRow())
    await confirmManual(photographer.userId, regId)
    return { ...photographer, eventId, regId }
  }

  it('lets the photographer undo while the client has not seen any photo', async () => {
    const { userId, regId } = await paidRegistration()
    await pool.query('select public.record_face_search($1, $2::uuid[])', [regId, []])
    await asUser(userId, c => c.query('select public.undo_manual_payment($1)', [regId]))
    const { rows } = await pool.query(
      'select status, payment_method, commission_cents, first_access_at, last_search_at is not null as searched from public.registrations where id = $1',
      [regId],
    )
    expect(rows[0]).toEqual({ status: 'wristband', payment_method: null, commission_cents: null, first_access_at: null, searched: true })
    expect(await logActions(regId)).toEqual(['delivered', 'confirmed_manual', 'undone'])
  })

  it('locks the photographer out once the client found photos', async () => {
    const { userId, eventId, regId } = await paidRegistration()
    const mediaId = await createMedia(eventId)
    await pool.query('select public.record_face_search($1, $2::uuid[])', [regId, [mediaId]])
    await expect(asUser(userId, c => c.query('select public.undo_manual_payment($1)', [regId]))).rejects.toThrow(
      'undo_locked',
    )
  })

  it('lets the admin undo after access and logs admin_undo', async () => {
    const adminId = await createAdmin()
    const { eventId, regId } = await paidRegistration()
    const mediaId = await createMedia(eventId)
    await pool.query('select public.record_face_search($1, $2::uuid[])', [regId, [mediaId]])
    await asUser(adminId, c => c.query('select public.undo_manual_payment($1)', [regId]))
    expect(await logActions(regId)).toEqual(['delivered', 'confirmed_manual', 'admin_undo'])
  })
})

describe('record_face_search', () => {
  it('stores matches once and is not callable by photographers', async () => {
    const { userId, photographerId } = await createPhotographer()
    const eventId = await createEvent(photographerId)
    const regId = await deliver(userId, eventId, await createClientRow())
    const mediaId = await createMedia(eventId)
    await pool.query('select public.record_face_search($1, $2::uuid[])', [regId, [mediaId]])
    await pool.query('select public.record_face_search($1, $2::uuid[])', [regId, [mediaId]])
    const { rows } = await pool.query('select count(*)::int as n from public.client_matches where registration_id = $1', [regId])
    expect(rows[0].n).toBe(1)
    await expect(
      asUser(userId, c => c.query('select public.record_face_search($1, $2::uuid[])', [regId, [mediaId]])),
    ).rejects.toThrow('permission denied')
  })
})
