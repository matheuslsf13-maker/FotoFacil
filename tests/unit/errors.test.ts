import { describe, expect, it } from 'vitest'
import { errorMessage } from '@/lib/errors'

describe('errorMessage', () => {
  it('maps database error codes to Portuguese messages', () => {
    expect(errorMessage({ message: 'undo_locked' })).toBe(
      'Não dá para desfazer: a cliente já acessou as fotos. Fale com o administrador.',
    )
    expect(errorMessage({ message: 'already_registered' })).toBe('Essa cliente já recebeu pulseira neste evento.')
    expect(errorMessage({ message: 'retention_exceeds_max' })).toBe('O prazo de exclusão passa do máximo permitido.')
  })

  it('maps unique violations on phone', () => {
    expect(errorMessage({ message: 'duplicate key value violates unique constraint "clients_phone_e164_key"' })).toBe(
      'Já existe uma cliente com esse celular.',
    )
  })

  it('falls back to a generic message', () => {
    expect(errorMessage({ message: 'boom' })).toBe('Algo deu errado. Tente de novo.')
    expect(errorMessage(null)).toBe('Algo deu errado. Tente de novo.')
  })
})
