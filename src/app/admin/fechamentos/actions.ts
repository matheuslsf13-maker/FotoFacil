'use server'

import { revalidatePath } from 'next/cache'
import type { ActionState } from '@/lib/action-state'
import { requireAdmin } from '@/lib/auth/guards'
import { errorMessage } from '@/lib/errors'
import { createClient } from '@/lib/supabase/server'

export interface SettlementInput {
  photographerId: string
  type: 'event' | 'month'
  eventId: string | null
  month: string | null
}

export async function createSettlementAction(input: SettlementInput): Promise<ActionState> {
  await requireAdmin()
  const supabase = await createClient()
  const { error } = await supabase.rpc('create_settlement', {
    p_photographer_id: input.photographerId,
    p_period_type: input.type,
    p_event_id: input.eventId,
    p_month: input.month,
  })
  if (error) return { error: errorMessage(error) }
  revalidatePath('/admin/fechamentos')
  return { error: null, ok: true }
}

export async function markSettlementPaid(settlementId: string): Promise<ActionState> {
  await requireAdmin()
  const supabase = await createClient()
  const { error } = await supabase.rpc('mark_settlement_paid', { p_settlement_id: settlementId })
  if (error) return { error: errorMessage(error) }
  revalidatePath('/admin/fechamentos')
  return { error: null, ok: true }
}
