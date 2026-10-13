import { describe, expect, it } from 'vitest'
import { centsToInput, formatBRL, parseBRLToCents } from '@/lib/domain/money'
import { describeCommission, formatCommissionInput, parsePercentToBasisPoints } from '@/lib/domain/commission'

describe('formatBRL', () => {
  it('formats cents as reais', () => {
    expect(formatBRL(5000)).toBe('R$ 50,00')
    expect(formatBRL(123456)).toBe('R$ 1.234,56')
  })
})

describe('centsToInput', () => {
  it('formats cents for a form input', () => {
    expect(centsToInput(5000)).toBe('50,00')
    expect(centsToInput(123456)).toBe('1234,56')
  })
})

describe('parseBRLToCents', () => {
  it.each([
    ['50', 5000],
    ['50,5', 5050],
    ['50,00', 5000],
    ['1.234,56', 123456],
    ['R$ 50,00', 5000],
    ['0', 0],
  ])('parses %s', (input, cents) => {
    expect(parseBRLToCents(input)).toBe(cents)
  })

  it.each(['abc', '50.00', '', '-5', '1,234'])('rejects %s', input => {
    expect(parseBRLToCents(input)).toBeNull()
  })
})

describe('commission helpers', () => {
  it('parses percentages into basis points', () => {
    expect(parsePercentToBasisPoints('15')).toBe(1500)
    expect(parsePercentToBasisPoints('15,5%')).toBe(1550)
    expect(parsePercentToBasisPoints('100')).toBe(10000)
    expect(parsePercentToBasisPoints('101')).toBeNull()
    expect(parsePercentToBasisPoints('x')).toBeNull()
  })

  it('describes commissions', () => {
    expect(describeCommission('percent', 1550)).toBe('15,5%')
    expect(describeCommission('fixed', 500)).toBe('R$ 5,00')
  })

  it('formats commission values for form inputs', () => {
    expect(formatCommissionInput('percent', 1550)).toBe('15,5')
    expect(formatCommissionInput('fixed', 500)).toBe('5,00')
  })
})
