import { randomInt, randomUUID } from 'node:crypto'
import { Pool, type PoolClient } from 'pg'
import { inject } from 'vitest'

export const pool = new Pool({ connectionString: inject('dbUrl'), max: 4 })

export async function closePool(): Promise<void> {
  await pool.end()
}

/** Runs `fn` inside a transaction as a Supabase API user (`authenticated`), or as `anon` when userId is null. */
export async function asUser<T>(userId: string | null, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query(userId ? 'set local role authenticated' : 'set local role anon')
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(userId ? { sub: userId, role: 'authenticated' } : { role: 'anon' }),
    ])
    const result = await fn(client)
    await client.query('commit')
    return result
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export function uniquePhone(): string {
  return `+55719${String(randomInt(0, 100_000_000)).padStart(8, '0')}`
}

export async function createUser(role: 'admin' | 'photographer'): Promise<string> {
  const { rows } = await pool.query("insert into auth.users (email) values (gen_random_uuid()::text || '@test.local') returning id")
  await pool.query('insert into public.profiles (id, role) values ($1, $2)', [rows[0].id, role])
  return rows[0].id
}

export async function createAdmin(): Promise<string> {
  return createUser('admin')
}

export interface PhotographerOpts {
  commissionType?: 'percent' | 'fixed'
  commissionValue?: number
  priceCents?: number
}

export async function createPhotographer(opts: PhotographerOpts = {}): Promise<{ userId: string; photographerId: string }> {
  const userId = await createUser('photographer')
  const { rows } = await pool.query(
    `insert into public.photographers (profile_id, name, whatsapp, default_price_cents, commission_type, commission_value)
     values ($1, 'Foto Teste', '+5571999990000', $2, $3, $4) returning id`,
    [userId, opts.priceCents ?? 5000, opts.commissionType ?? 'percent', opts.commissionValue ?? 1500],
  )
  return { userId, photographerId: rows[0].id }
}

export async function createClientRow(fullName = 'Ana Souza'): Promise<string> {
  const { rows } = await pool.query('insert into public.clients (full_name, phone_e164) values ($1, $2) returning id', [
    fullName,
    uniquePhone(),
  ])
  return rows[0].id
}

export interface EventOpts {
  priceCents?: number
  startDate?: string
  endDate?: string
  retentionDays?: number
  status?: 'active' | 'expired'
}

export async function createEvent(photographerId: string, opts: EventOpts = {}): Promise<string> {
  const { rows: today } = await pool.query("select to_char(public.today_sp(), 'YYYY-MM-DD') as d")
  const { rows } = await pool.query(
    `insert into public.events (photographer_id, name, slug, start_date, end_date, price_cents, retention_days, status)
     values ($1, 'Festa Teste', $2, $3, $4, $5, $6, $7) returning id`,
    [
      photographerId,
      `festa-${randomUUID().slice(0, 8)}`,
      opts.startDate ?? today[0].d,
      opts.endDate ?? today[0].d,
      opts.priceCents ?? 5000,
      opts.retentionDays ?? 30,
      opts.status ?? 'active',
    ],
  )
  return rows[0].id
}

export async function insertRegistration(eventId: string, clientId: string, priceCents = 5000): Promise<string> {
  const { rows } = await pool.query(
    `insert into public.registrations (event_id, client_id, terms_accepted_at, price_cents)
     values ($1, $2, now(), $3) returning id`,
    [eventId, clientId, priceCents],
  )
  return rows[0].id
}

export async function deliver(userId: string, eventId: string, clientId: string): Promise<string> {
  return asUser(userId, async c => (await c.query('select public.deliver_wristband($1, $2, true) as id', [eventId, clientId])).rows[0].id)
}

export async function confirmManual(userId: string, registrationId: string): Promise<void> {
  await asUser(userId, c => c.query('select public.confirm_manual_payment($1)', [registrationId]))
}

export async function createMedia(eventId: string): Promise<string> {
  const { rows } = await pool.query(
    `insert into public.media (event_id, type, original_name, storage_path, thumb_path, taken_on, status)
     values ($1, 'photo', 'a.jpg', 'x/full.jpg', 'x/thumb.jpg', current_date, 'ready') returning id`,
    [eventId],
  )
  return rows[0].id
}
