const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function formatBRL(cents: number): string {
  return brl.format(cents / 100)
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',')
}

const GROUPED = /^\d{1,3}(\.\d{3})+(,\d{1,2})?$/
const PLAIN = /^\d+(,\d{1,2})?$/

export function parseBRLToCents(input: string): number | null {
  const value = input.replace(/R\$\s?/i, '').trim()
  if (!GROUPED.test(value) && !PLAIN.test(value)) return null
  const [intPart, decPart = ''] = value.replace(/\./g, '').split(',')
  return Number(intPart) * 100 + Number(decPart.padEnd(2, '0'))
}
