import { afterAll, describe, expect, it } from 'vitest'
import {
  closePool,
  createClientRow,
  createEvent,
  createPhotographer,
  insertRegistration,
  pool,
  uniquePhone,
} from './helpers'

afterAll(closePool)

describe('schema', () => {
  it('computes expires_at as end_date + retention_days', async () => {
    const { photographerId } = await createPhotographer()
    const id = await createEvent(photographerId, { startDate: '2026-10-10', endDate: '2026-10-12', retentionDays: 30 })
    const { rows } = await pool.query("select to_char(expires_at, 'YYYY-MM-DD') as d from public.events where id = $1", [id])
    expect(rows[0].d).toBe('2026-11-11')
  })

  it('rejects retention above settings.max_retention_days', async () => {
    const { photographerId } = await createPhotographer()
    await expect(createEvent(photographerId, { retentionDays: 91 })).rejects.toThrow('retention_exceeds_max')
  })

  it('rejects an end date before the start date', async () => {
    const { photographerId } = await createPhotographer()
    await expect(createEvent(photographerId, { startDate: '2026-10-12', endDate: '2026-10-10' })).rejects.toThrow(
      'violates check constraint',
    )
  })

  it('rejects a duplicate phone', async () => {
    const phone = uniquePhone()
    await pool.query("insert into public.clients (full_name, phone_e164) values ('Ana Souza', $1)", [phone])
    await expect(
      pool.query("insert into public.clients (full_name, phone_e164) values ('Bia Lima', $1)", [phone]),
    ).rejects.toThrow('duplicate key')
  })

  it('rejects a duplicate wristband for the same client and event', async () => {
    const { photographerId } = await createPhotographer()
    const eventId = await createEvent(photographerId)
    const clientId = await createClientRow()
    await insertRegistration(eventId, clientId)
    await expect(insertRegistration(eventId, clientId)).rejects.toThrow('duplicate key')
  })

  it('rejects a paid registration without payment data', async () => {
    const { photographerId } = await createPhotographer()
    const eventId = await createEvent(photographerId)
    const clientId = await createClientRow()
    await expect(
      pool.query(
        `insert into public.registrations (event_id, client_id, terms_accepted_at, price_cents, status)
         values ($1, $2, now(), 5000, 'paid')`,
        [eventId, clientId],
      ),
    ).rejects.toThrow('violates check constraint')
  })

  it('creates the storage buckets', async () => {
    const { rows } = await pool.query('select id, public from storage.buckets order by id')
    expect(rows).toEqual([
      { id: 'media', public: false },
      { id: 'public-assets', public: true },
    ])
  })
})
