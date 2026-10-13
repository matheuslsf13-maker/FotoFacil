'use client'

import type { ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import { Button, type ButtonVariant } from './ui'

export function SubmitButton({
  children,
  pendingText = 'Salvando…',
  variant = 'primary',
}: {
  children: ReactNode
  pendingText?: string
  variant?: ButtonVariant
}) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} variant={variant}>
      {pending ? pendingText : children}
    </Button>
  )
}
