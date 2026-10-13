import { centsToInput, formatBRL } from './money'

export type CommissionType = 'percent' | 'fixed'

function percentText(basisPoints: number): string {
  return (basisPoints / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

export function describeCommission(type: CommissionType, value: number): string {
  return type === 'percent' ? `${percentText(value)}%` : formatBRL(value)
}

export function parsePercentToBasisPoints(input: string): number | null {
  const value = input.replace('%', '').trim().replace(',', '.')
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(value)) return null
  const basisPoints = Math.round(Number(value) * 100)
  return basisPoints <= 10000 ? basisPoints : null
}

export function formatCommissionInput(type: CommissionType, value: number): string {
  return type === 'percent' ? percentText(value) : centsToInput(value)
}
