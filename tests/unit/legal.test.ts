import { describe, expect, it } from 'vitest'
import { FACE_CONSENT_TEXT, PRIVACY_SECTIONS, TERMS_SECTIONS } from '@/lib/legal'

const privacy = PRIVACY_SECTIONS.map(s => `${s.title} ${s.body}`).join(' ')

describe('legal texts', () => {
  it('discloses what the spec requires about face recognition', () => {
    expect(privacy).toContain('não fica guardada')
    expect(privacy).toContain('fora do Brasil')
    expect(privacy).toContain('excluídos no fim do prazo')
    expect(privacy).toContain('consentimento')
    expect(FACE_CONSENT_TEXT).toContain('não fica guardada')
  })

  it('has terms about payment and availability', () => {
    const terms = TERMS_SECTIONS.map(s => s.body).join(' ')
    expect(terms).toContain('pagamento')
    expect(terms).toContain('prazo')
  })
})
