import { afterAll, describe, expect, it } from 'vitest'
import {
  asUser,
  closePool,
  confirmManual,
  createAdmin,
  createClientRow,
  createEvent,
  createPhotographer,
  deliver,
  pool,
} from './helpers'

afterAll(closePool)

interface Totals {
  n: number
  total: number
  pix: number
  manual: number
}

async function preview(adminId: string, photographerId: string, type: 'event' | 'month', eventId: string | null, month: string | null): Promise<Totals> {
  return asUser(adminId, async c => {
    const { rows } = await c.query(
      `select sales_count as n, total_sales_cents::int as total, commission_pix_cents::int as pix, commission_manual_cents::int as manual
       from public.settlement_preview($1::uuid, $2::text, $3::uuid, $4::date)`,
      [photographerId, type, eventId, month],
    )
    return rows[0]
  })
}

async function payWithPix(regId: string): Promise<void> {
  await pool.query(
    `update public.registrations
     set status = 'paid', payment_method = 'pix', paid_at = now(),
         commission_cents = public.compute_commission(price_cents, 'percent', 1500)
     where id = $1`,
    [regId],
  )
}

async function setup() {
  const adminId = await createAdmin()
  const photographer = await createPhotographer({ commissionType: 'percent', commissionValue: 1500 })
  const eventId = await createEvent(photographer.photographerId, { priceCents: 5000 })
  const manual = await deliver(photographer.userId, eventId, await createClientRow())
  await confirmManual(photographer.userId, manual)
  const pix = await deliver(photographer.userId, eventId, await createClientRow())
  await payWithPix(pix)
  await deliver(photographer.userId, eventId, await createClientRow())
  return { adminId, ...photographer, eventId, manual, pix }
}

describe('settlements', () => {
  it('previews an event separating PIX and manual commissions and ignoring unpaid wristbands', async () => {
    const { adminId, photographerId, eventId } = await setup()
    expect(await preview(adminId, photographerId, 'event', eventId, null)).toEqual({ n: 2, total: 10000, pix: 750, manual: 750 })
  })

  it('creates a settlement once and refuses an empty one', async () => {
    const { adminId, photographerId, eventId } = await setup()
    const settlementId = await asUser(adminId, async c =>
      (await c.query("select public.create_settlement($1, 'event', $2, null) as id", [photographerId, eventId])).rows[0].id,
    )
    const { rows } = await pool.query(
      'select sales_count, commission_manual_cents::int as manual, status from public.settlements where id = $1',
      [settlementId],
    )
    expect(rows[0]).toEqual({ sales_count: 2, manual: 750, status: 'open' })
    expect(await preview(adminId, photographerId, 'event', eventId, null)).toEqual({ n: 0, total: 0, pix: 0, manual: 0 })
    await expect(
      asUser(adminId, c => c.query("select public.create_settlement($1, 'event', $2, null)", [photographerId, eventId])),
    ).rejects.toThrow('no_sales')
  })

  it('assigns monthly sales by the São Paulo calendar', async () => {
    const { adminId, photographerId, manual, pix } = await setup()
    await pool.query("update public.registrations set paid_at = '2026-10-01T02:00:00Z' where id = any($1::uuid[])", [[manual, pix]])
    expect(await preview(adminId, photographerId, 'month', null, '2026-09-01')).toMatchObject({ n: 2 })
    expect(await preview(adminId, photographerId, 'month', null, '2026-10-01')).toMatchObject({ n: 0 })
  })

  it('is admin only', async () => {
    const { userId, photographerId, eventId } = await setup()
    await expect(
      asUser(userId, c => c.query("select * from public.settlement_preview($1, 'event', $2, null)", [photographerId, eventId])),
    ).rejects.toThrow('not_authorized')
  })

  it('lets the admin undo a sale in an open settlement, recomputing totals, but not in a paid one', async () => {
    const { adminId, photographerId, eventId, manual } = await setup()
    const settlementId = await asUser(adminId, async c =>
      (await c.query("select public.create_settlement($1, 'event', $2, null) as id", [photographerId, eventId])).rows[0].id,
    )
    await asUser(adminId, c => c.query('select public.undo_manual_payment($1)', [manual]))
    const { rows } = await pool.query(
      'select sales_count, commission_manual_cents::int as manual from public.settlements where id = $1',
      [settlementId],
    )
    expect(rows[0]).toEqual({ sales_count: 1, manual: 0 })

    const other = await setup()
    const paidSettlement = await asUser(other.adminId, async c =>
      (await c.query("select public.create_settlement($1, 'event', $2, null) as id", [other.photographerId, other.eventId])).rows[0].id,
    )
    await asUser(other.adminId, c => c.query('select public.mark_settlement_paid($1)', [paidSettlement]))
    await expect(asUser(other.adminId, c => c.query('select public.undo_manual_payment($1)', [other.manual]))).rejects.toThrow(
      'undo_locked',
    )
    await expect(asUser(other.adminId, c => c.query('select public.mark_settlement_paid($1)', [paidSettlement]))).rejects.toThrow(
      'invalid_state',
    )
  })
})
