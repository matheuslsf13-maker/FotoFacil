export type RegistrationStatus = 'wristband' | 'paid'
export type PaymentMethod = 'manual' | 'pix'

export interface RegistrationSummaryRow {
  status: RegistrationStatus
  payment_method: PaymentMethod | null
  price_cents: number
  first_access_at: string | null
  settlement_id: string | null
}

export function summarizeRegistrations(rows: RegistrationSummaryRow[]) {
  const paid = rows.filter(r => r.status === 'paid')
  return {
    delivered: rows.length,
    paid: paid.length,
    totalPaidCents: paid.reduce((sum, r) => sum + r.price_cents, 0),
  }
}

export function canPhotographerUndo(row: RegistrationSummaryRow): boolean {
  return row.status === 'paid' && row.payment_method === 'manual' && row.first_access_at === null && row.settlement_id === null
}

export function statusLabel(row: { status: RegistrationStatus; payment_method: PaymentMethod | null }): string {
  if (row.status === 'wristband') return 'Pulseira entregue'
  return row.payment_method === 'pix' ? 'Pago (PIX)' : 'Pago (manual)'
}

export function canAdminUndo(row: {
  status: RegistrationStatus
  payment_method: PaymentMethod | null
  settlement_status: 'open' | 'paid' | null
}): boolean {
  return row.status === 'paid' && row.payment_method === 'manual' && row.settlement_status !== 'paid'
}
