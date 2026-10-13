import { describe, expect, it } from 'vitest'
import {
  clientSchema,
  eventSchema,
  newPhotographerSchema,
  parseForm,
  photographerSchema,
  profileSchema,
  settingsSchema,
} from '@/lib/validation'

describe('clientSchema', () => {
  it('normalizes name and phone', () => {
    expect(parseForm(clientSchema, { fullName: '  Ana   Souza ', phone: '(71) 99123-4567' })).toEqual({
      ok: true,
      data: { full_name: 'Ana Souza', phone_e164: '+5571991234567' },
    })
  })

  it('requires first and last name', () => {
    expect(parseForm(clientSchema, { fullName: 'Ana', phone: '71991234567' })).toEqual({
      ok: false,
      error: 'Informe nome e sobrenome.',
    })
  })

  it('rejects an invalid phone', () => {
    expect(parseForm(clientSchema, { fullName: 'Ana Souza', phone: '123' })).toEqual({ ok: false, error: 'Celular inválido.' })
  })
})

describe('photographerSchema', () => {
  it('parses percent commission into basis points', () => {
    expect(
      parseForm(photographerSchema, {
        name: 'João Foto',
        whatsapp: '71 98888-7777',
        price: '50,00',
        commissionType: 'percent',
        commissionValue: '15',
      }),
    ).toEqual({
      ok: true,
      data: {
        name: 'João Foto',
        whatsapp: '+5571988887777',
        default_price_cents: 5000,
        commission_type: 'percent',
        commission_value: 1500,
      },
    })
  })

  it('parses fixed commission into cents and rejects bad values', () => {
    const base = { name: 'João Foto', whatsapp: '71988887777', price: '50', commissionType: 'fixed' }
    expect(parseForm(photographerSchema, { ...base, commissionValue: '5,00' })).toMatchObject({
      ok: true,
      data: { commission_value: 500 },
    })
    expect(parseForm(photographerSchema, { ...base, commissionValue: 'x' })).toEqual({ ok: false, error: 'Comissão inválida.' })
  })

  it('validates email and password for new photographers', () => {
    const input = {
      name: 'João Foto',
      whatsapp: '71988887777',
      price: '50',
      commissionType: 'percent',
      commissionValue: '10',
      email: ' JOAO@Example.com ',
      password: '12345678',
    }
    expect(parseForm(newPhotographerSchema, input)).toMatchObject({ ok: true, data: { email: 'joao@example.com' } })
    expect(parseForm(newPhotographerSchema, { ...input, password: '123' })).toEqual({
      ok: false,
      error: 'A senha precisa ter 8 caracteres ou mais.',
    })
  })
})

describe('profileSchema', () => {
  it('rejects a zero price', () => {
    expect(parseForm(profileSchema, { name: 'João', whatsapp: '71988887777', price: '0' })).toEqual({
      ok: false,
      error: 'Valor inválido.',
    })
  })
})

describe('settingsSchema', () => {
  const base = {
    defaultRetentionDays: '30',
    maxRetentionDays: '90',
    commissionType: 'percent',
    commissionValue: '10',
    faceMatchThreshold: '90',
    dailySearchLimit: '10',
  }

  it('maps to settings columns', () => {
    expect(parseForm(settingsSchema, base)).toEqual({
      ok: true,
      data: {
        default_retention_days: 30,
        max_retention_days: 90,
        default_commission_type: 'percent',
        default_commission_value: 1000,
        face_match_threshold: 90,
        daily_search_limit: 10,
      },
    })
  })

  it('rejects a default above the maximum', () => {
    expect(parseForm(settingsSchema, { ...base, defaultRetentionDays: '100' })).toEqual({
      ok: false,
      error: 'O prazo padrão não pode passar do máximo.',
    })
  })
})

describe('eventSchema', () => {
  it('maps to event columns', () => {
    expect(
      parseForm(eventSchema, { name: 'Carnaval', startDate: '2027-02-10', endDate: '2027-02-13', price: '60', retentionDays: '30' }),
    ).toEqual({
      ok: true,
      data: { name: 'Carnaval', start_date: '2027-02-10', end_date: '2027-02-13', price_cents: 6000, retention_days: 30 },
    })
  })

  it('rejects an end date before the start date', () => {
    expect(
      parseForm(eventSchema, { name: 'Carnaval', startDate: '2027-02-10', endDate: '2027-02-09', price: '60', retentionDays: '30' }),
    ).toEqual({ ok: false, error: 'A data final deve ser igual ou depois da inicial.' })
  })
})
