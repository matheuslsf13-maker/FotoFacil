import { describe, expect, it } from 'vitest'
import { canPhotographerUndo, statusLabel, summarizeRegistrations } from '@/lib/domain/registrations'

const base = { price_cents: 5000, first_access_at: null, settlement_id: null }

describe('summarizeRegistrations', () => {
  it('counts wristbands, paid and total sold', () => {
    expect(
      summarizeRegistrations([
        { ...base, status: 'wristband', payment_method: null },
        { ...base, status: 'paid', payment_method: 'manual' },
        { ...base, status: 'paid', payment_method: 'pix', price_cents: 6000 },
      ]),
    ).toEqual({ delivered: 3, paid: 2, totalPaidCents: 11000 })
  })
})

describe('canPhotographerUndo', () => {
  it('allows only manual payments not yet accessed nor settled', () => {
    expect(canPhotographerUndo({ ...base, status: 'paid', payment_method: 'manual' })).toBe(true)
    expect(canPhotographerUndo({ ...base, status: 'paid', payment_method: 'manual', first_access_at: '2026-10-13T10:00:00Z' })).toBe(false)
    expect(canPhotographerUndo({ ...base, status: 'paid', payment_method: 'manual', settlement_id: 's1' })).toBe(false)
    expect(canPhotographerUndo({ ...base, status: 'paid', payment_method: 'pix' })).toBe(false)
    expect(canPhotographerUndo({ ...base, status: 'wristband', payment_method: null })).toBe(false)
  })
})

describe('statusLabel', () => {
  it('labels each status', () => {
    expect(statusLabel({ status: 'wristband', payment_method: null })).toBe('Pulseira entregue')
    expect(statusLabel({ status: 'paid', payment_method: 'manual' })).toBe('Pago (manual)')
    expect(statusLabel({ status: 'paid', payment_method: 'pix' })).toBe('Pago (PIX)')
  })
})
