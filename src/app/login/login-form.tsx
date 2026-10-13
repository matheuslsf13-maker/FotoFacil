'use client'

import { useActionState } from 'react'
import { SubmitButton } from '@/components/submit-button'
import { ErrorText, Field, Input } from '@/components/ui'
import { initialActionState } from '@/lib/action-state'
import { signIn } from './actions'

export function LoginForm() {
  const [state, formAction] = useActionState(signIn, initialActionState)
  return (
    <form action={formAction} className="space-y-3">
      <Field label="E-mail">
        <Input name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Senha">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <ErrorText>{state.error}</ErrorText>
      <SubmitButton pendingText="Entrando…">Entrar</SubmitButton>
    </form>
  )
}
