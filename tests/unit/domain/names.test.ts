import { describe, expect, it } from 'vitest'
import { buildNameList, displayName, matchesNameFilter } from '@/lib/domain/names'

describe('displayName', () => {
  it('shows first name and last-name initial', () => {
    expect(displayName('ana maria SOUZA')).toBe('Ana S.')
  })

  it('handles a single name and extra spaces', () => {
    expect(displayName('  bia  ')).toBe('Bia')
  })

  it('handles accented names', () => {
    expect(displayName('Ágata Érica Ávila')).toBe('Ágata Á.')
  })
})

describe('buildNameList', () => {
  it('keeps clients with the same short name separate and sorts by label', () => {
    const list = buildNameList([
      { registrationId: 'r3', fullName: 'Carla Lima' },
      { registrationId: 'r1', fullName: 'Ana Souza' },
      { registrationId: 'r2', fullName: 'Ana Santos' },
    ])
    expect(list.map(i => i.label)).toEqual(['Ana S.', 'Ana S.', 'Carla L.'])
    expect(new Set(list.map(i => i.registrationId)).size).toBe(3)
  })
})

describe('matchesNameFilter', () => {
  it('ignores case and accents', () => {
    expect(matchesNameFilter('Ágata Á.', 'aga')).toBe(true)
    expect(matchesNameFilter('Ana S.', 'bia')).toBe(false)
    expect(matchesNameFilter('Ana S.', '  ')).toBe(true)
  })
})
