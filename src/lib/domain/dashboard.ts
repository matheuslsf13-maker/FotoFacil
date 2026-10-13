export interface SaleRow {
  price_cents: number
  commission_cents: number
  payment_method: 'manual' | 'pix'
  photographer_name: string
}

export interface SalesSummary {
  count: number
  totalCents: number
  commissionPixCents: number
  commissionManualCents: number
}

export function summarizeSales(rows: SaleRow[]): SalesSummary {
  return rows.reduce<SalesSummary>(
    (acc, row) => ({
      count: acc.count + 1,
      totalCents: acc.totalCents + row.price_cents,
      commissionPixCents: acc.commissionPixCents + (row.payment_method === 'pix' ? row.commission_cents : 0),
      commissionManualCents: acc.commissionManualCents + (row.payment_method === 'manual' ? row.commission_cents : 0),
    }),
    { count: 0, totalCents: 0, commissionPixCents: 0, commissionManualCents: 0 },
  )
}

export function salesByPhotographer(rows: SaleRow[]): Array<{ name: string } & SalesSummary> {
  const groups = new Map<string, SaleRow[]>()
  for (const row of rows) groups.set(row.photographer_name, [...(groups.get(row.photographer_name) ?? []), row])
  return [...groups.entries()]
    .map(([name, group]) => ({ name, ...summarizeSales(group) }))
    .sort((a, b) => b.totalCents - a.totalCents)
}

export function monthRange(month: string): { startIso: string; endIso: string; monthStart: string } {
  const [year, monthNumber] = month.split('-').map(Number)
  const nextYear = monthNumber === 12 ? year + 1 : year
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    startIso: `${year}-${pad(monthNumber)}-01T00:00:00-03:00`,
    endIso: `${nextYear}-${pad(nextMonth)}-01T00:00:00-03:00`,
    monthStart: `${year}-${pad(monthNumber)}-01`,
  }
}
