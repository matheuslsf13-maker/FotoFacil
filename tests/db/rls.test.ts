import { afterAll, describe, expect, it } from 'vitest'
import {
  asUser,
  closePool,
  createAdmin,
  createClientRow,
  createEvent,
  createPhotographer,
  insertRegistration,
} from './helpers'

afterAll(closePool)

describe('row level security', () => {
  it('a photographer sees only his own events', async () => {
    const a = await createPhotographer()
    const b = await createPhotographer()
    const eventA = await createEvent(a.photographerId)
    const eventB = await createEvent(b.photographerId)
    const ids = await asUser(a.userId, async c => (await c.query('select id from public.events')).rows.map(r => r.id))
    expect(ids).toContain(eventA)
    expect(ids).not.toContain(eventB)
  })

  it('the admin sees every event', async () => {
    const adminId = await createAdmin()
    const a = await createPhotographer()
    const eventA = await createEvent(a.photographerId)
    const ids = await asUser(adminId, async c => (await c.query('select id from public.events')).rows.map(r => r.id))
    expect(ids).toContain(eventA)
  })

  it('anon cannot read events', async () => {
    await expect(asUser(null, c => c.query('select id from public.events'))).rejects.toThrow('permission denied')
  })

  it('a photographer cannot create an event for another photographer', async () => {
    const a = await createPhotographer()
    const b = await createPhotographer()
    await expect(
      asUser(a.userId, c =>
        c.query(
          `insert into public.events (photographer_id, name, slug, start_date, end_date, price_cents, retention_days)
           values ($1, 'X', 'x-rls-test', current_date, current_date, 5000, 30)`,
          [b.photographerId],
        ),
      ),
    ).rejects.toThrow('row-level security')
  })

  it('a photographer cannot change his commission but can change his WhatsApp', async () => {
    const a = await createPhotographer()
    await expect(
      asUser(a.userId, c => c.query('update public.photographers set commission_value = 0 where profile_id = $1', [a.userId])),
    ).rejects.toThrow('not_authorized')
    const result = await asUser(a.userId, c =>
      c.query("update public.photographers set whatsapp = '+5571988887777' where profile_id = $1", [a.userId]),
    )
    expect(result.rowCount).toBe(1)
  })

  it('a photographer cannot change event status', async () => {
    const a = await createPhotographer()
    const eventA = await createEvent(a.photographerId)
    await expect(
      asUser(a.userId, c => c.query("update public.events set status = 'expired' where id = $1", [eventA])),
    ).rejects.toThrow('not_authorized')
  })

  it('a photographer reads only clients registered in his events', async () => {
    const a = await createPhotographer()
    const b = await createPhotographer()
    const eventA = await createEvent(a.photographerId)
    const eventB = await createEvent(b.photographerId)
    const mine = await createClientRow('Ana Souza')
    const theirs = await createClientRow('Bia Lima')
    await insertRegistration(eventA, mine)
    await insertRegistration(eventB, theirs)
    const ids = await asUser(a.userId, async c => (await c.query('select id from public.clients')).rows.map(r => r.id))
    expect(ids).toContain(mine)
    expect(ids).not.toContain(theirs)
  })

  it('a photographer cannot read registrations of other events', async () => {
    const a = await createPhotographer()
    const b = await createPhotographer()
    const eventB = await createEvent(b.photographerId)
    const regB = await insertRegistration(eventB, await createClientRow())
    const ids = await asUser(a.userId, async c => (await c.query('select id from public.registrations')).rows.map(r => r.id))
    expect(ids).not.toContain(regB)
  })

  it('a photographer cannot update settings', async () => {
    const a = await createPhotographer()
    const result = await asUser(a.userId, c => c.query('update public.settings set daily_search_limit = 99'))
    expect(result.rowCount).toBe(0)
  })
})
