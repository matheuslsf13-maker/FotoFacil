import { z } from 'zod'
import { parsePercentToBasisPoints, type CommissionType } from './domain/commission'
import { parseBRLToCents } from './domain/money'
import { normalizePhone } from './domain/phone'

export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string }

export function parseForm<S extends z.ZodTypeAny>(schema: S, input: unknown): ParseResult<z.output<S>> {
  const result = schema.safeParse(input)
  if (result.success) return { ok: true, data: result.data as z.output<S> }
  return { ok: false, error: result.error.issues[0]?.message ?? 'Dados inválidos.' }
}

const phoneField = z.string().transform((value, ctx) => {
  const phone = normalizePhone(value)
  if (!phone) {
    ctx.addIssue({ code: 'custom', message: 'Celular inválido.' })
    return z.NEVER
  }
  return phone
})

const priceField = z.string().transform((value, ctx) => {
  const cents = parseBRLToCents(value)
  if (cents === null || cents <= 0) {
    ctx.addIssue({ code: 'custom', message: 'Valor inválido.' })
    return z.NEVER
  }
  return cents
})

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.')

function parseCommission(type: CommissionType, raw: string): number | null {
  return type === 'percent' ? parsePercentToBasisPoints(raw) : parseBRLToCents(raw)
}

export const clientSchema = z
  .object({
    fullName: z.string().transform(v => v.trim().replace(/\s+/g, ' ')),
    phone: phoneField,
  })
  .transform((v, ctx) => {
    if (v.fullName.split(' ').length < 2 || v.fullName.length < 3) {
      ctx.addIssue({ code: 'custom', message: 'Informe nome e sobrenome.' })
      return z.NEVER
    }
    return { full_name: v.fullName, phone_e164: v.phone }
  })

const photographerShape = {
  name: z.string().trim().min(2, 'Informe o nome.'),
  whatsapp: phoneField,
  price: priceField,
  commissionType: z.enum(['percent', 'fixed']),
  commissionValue: z.string(),
}

export const photographerSchema = z.object(photographerShape).transform((v, ctx) => {
  const commission = parseCommission(v.commissionType, v.commissionValue)
  if (commission === null) {
    ctx.addIssue({ code: 'custom', message: 'Comissão inválida.' })
    return z.NEVER
  }
  return {
    name: v.name,
    whatsapp: v.whatsapp,
    default_price_cents: v.price,
    commission_type: v.commissionType,
    commission_value: commission,
  }
})

export const newPhotographerSchema = z
  .object({
    ...photographerShape,
    email: z.string().trim().toLowerCase().email('E-mail inválido.'),
    password: z.string().min(8, 'A senha precisa ter 8 caracteres ou mais.'),
  })
  .transform((v, ctx) => {
    const commission = parseCommission(v.commissionType, v.commissionValue)
    if (commission === null) {
      ctx.addIssue({ code: 'custom', message: 'Comissão inválida.' })
      return z.NEVER
    }
    return {
      email: v.email,
      password: v.password,
      photographer: {
        name: v.name,
        whatsapp: v.whatsapp,
        default_price_cents: v.price,
        commission_type: v.commissionType,
        commission_value: commission,
      },
    }
  })

export const profileSchema = z
  .object({ name: z.string().trim().min(2, 'Informe o nome.'), whatsapp: phoneField, price: priceField })
  .transform(v => ({ name: v.name, whatsapp: v.whatsapp, default_price_cents: v.price }))

export const settingsSchema = z
  .object({
    defaultRetentionDays: z.coerce.number().int().min(1, 'Prazo padrão inválido.').max(365, 'Prazo padrão inválido.'),
    maxRetentionDays: z.coerce.number().int().min(1, 'Prazo máximo inválido.').max(365, 'Prazo máximo inválido.'),
    commissionType: z.enum(['percent', 'fixed']),
    commissionValue: z.string(),
    faceMatchThreshold: z.coerce.number().int().min(50, 'Use um valor entre 50 e 99.').max(99, 'Use um valor entre 50 e 99.'),
    dailySearchLimit: z.coerce.number().int().min(1, 'Use um valor entre 1 e 100.').max(100, 'Use um valor entre 1 e 100.'),
  })
  .transform((v, ctx) => {
    if (v.defaultRetentionDays > v.maxRetentionDays) {
      ctx.addIssue({ code: 'custom', message: 'O prazo padrão não pode passar do máximo.' })
      return z.NEVER
    }
    const commission = parseCommission(v.commissionType, v.commissionValue)
    if (commission === null) {
      ctx.addIssue({ code: 'custom', message: 'Comissão inválida.' })
      return z.NEVER
    }
    return {
      default_retention_days: v.defaultRetentionDays,
      max_retention_days: v.maxRetentionDays,
      default_commission_type: v.commissionType,
      default_commission_value: commission,
      face_match_threshold: v.faceMatchThreshold,
      daily_search_limit: v.dailySearchLimit,
    }
  })

export const eventSchema = z
  .object({
    name: z.string().trim().min(2, 'Informe o nome do evento.'),
    startDate: isoDate,
    endDate: isoDate,
    price: priceField,
    retentionDays: z.coerce.number().int().min(1, 'Prazo de exclusão inválido.'),
  })
  .transform((v, ctx) => {
    if (v.endDate < v.startDate) {
      ctx.addIssue({ code: 'custom', message: 'A data final deve ser igual ou depois da inicial.' })
      return z.NEVER
    }
    return { name: v.name, start_date: v.startDate, end_date: v.endDate, price_cents: v.price, retention_days: v.retentionDays }
  })
