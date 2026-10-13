import { describe, expect, it } from 'vitest'
import { paymentRequestMessage, whatsappLink } from '@/lib/domain/whatsapp'
import { eventSlug, slugify } from '@/lib/domain/slug'

describe('whatsappLink', () => {
  it('builds a wa.me link with an encoded message', () => {
    expect(whatsappLink('+5571991234567', 'Oi, tudo bem?')).toBe('https://wa.me/5571991234567?text=Oi%2C%20tudo%20bem%3F')
  })

  it('writes the payment request message', () => {
    expect(paymentRequestMessage('Ana Souza', 'Carnaval 2027')).toBe(
      'Oi! Sou Ana Souza, do evento Carnaval 2027. Quero confirmar o pagamento das minhas fotos.',
    )
  })
})

describe('slug', () => {
  it('slugifies names without accents', () => {
    expect(slugify('  Festa de São João 2027! ')).toBe('festa-de-sao-joao-2027')
  })

  it('appends the suffix', () => {
    expect(eventSlug('Carnaval', 'ab12')).toBe('carnaval-ab12')
    expect(eventSlug('!!!', 'ab12')).toBe('evento-ab12')
  })

  it('generates a 4-character random suffix by default', () => {
    expect(eventSlug('Carnaval')).toMatch(/^carnaval-[a-z2-9]{4}$/)
  })
})
