'use client'

import { useActionState, type ReactNode } from 'react'
import { initialActionState, type ActionState } from '@/lib/action-state'
import { SubmitButton } from './submit-button'
import { ErrorText } from './ui'

export function ActionForm({
  action,
  submitLabel,
  pendingText,
  className = 'space-y-3',
  children,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>
  submitLabel: string
  pendingText?: string
  className?: string
  children: ReactNode
}) {
  const [state, formAction] = useActionState(action, initialActionState)
  return (
    <form action={formAction} className={className}>
      {children}
      <ErrorText>{state.error}</ErrorText>
      {state.ok ? <p className="text-sm text-green-700">Salvo!</p> : null}
      <SubmitButton pendingText={pendingText}>{submitLabel}</SubmitButton>
    </form>
  )
}
