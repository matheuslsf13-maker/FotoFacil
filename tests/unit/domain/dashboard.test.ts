import { describe, expect, it } from 'vitest'
import { monthRange, salesByPhotographer, summarizeSales, type SaleRow } from '@/lib/domain/dashboard'

const rows: SaleRow[] = [
  { price_cents: 5000, commission_cents: 750, payment_method: 'manual', photographer_name: 'João' },
  { price_cents: 5000, commission_cents: 750, payment_method: 'pix', photographer_name: 'João' },
  { price_cents: 8000, commission_cents: 500, payment_method: 'manual', photographer_name: 'Maria' },
]

describe('dashboard', () => {
  it('summarizes sales and splits commission by payment method', () => {
    expect(summarizeSales(rows)).toEqual({ count: 3, totalCents: 18000, commissionPixCents: 750, commissionManualCents: 1250 })
  })

  it('groups sales by photographer, biggest first', () => {
    expect(salesByPhotographer(rows)).toEqual([
      { name: 'João', count: 2, totalCents: 10000, commissionPixCents: 750, commissionManualCents: 750 },
      { name: 'Maria', count: 1, totalCents: 8000, commissionPixCents: 0, commissionManualCents: 500 },
    ])
  })

  it('computes a São Paulo month range', () => {
    expect(monthRange('2026-12')).toEqual({
      startIso: '2026-12-01T00:00:00-03:00',
      endIso: '2027-01-01T00:00:00-03:00',
      monthStart: '2026-12-01',
    })
  })
})
