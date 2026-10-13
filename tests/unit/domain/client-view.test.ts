import { describe, expect, it } from 'vitest'
import { clientView, hasNewMedia } from '@/lib/domain/client-view'

describe('clientView', () => {
  it('shows the payment notice until the registration is paid', () => {
    expect(clientView({ status: 'wristband', lastSearchAt: null, forceSearch: false })).toBe('payment')
    expect(clientView({ status: 'wristband', lastSearchAt: null, forceSearch: true })).toBe('payment')
  })

  it('asks for a selfie before the first search or when forced', () => {
    expect(clientView({ status: 'paid', lastSearchAt: null, forceSearch: false })).toBe('search')
    expect(clientView({ status: 'paid', lastSearchAt: '2026-10-13T10:00:00Z', forceSearch: true })).toBe('search')
  })

  it('shows the gallery after a search', () => {
    expect(clientView({ status: 'paid', lastSearchAt: '2026-10-13T10:00:00Z', forceSearch: false })).toBe('gallery')
  })
})

describe('hasNewMedia', () => {
  it('is true only when media arrived after the last search', () => {
    expect(hasNewMedia('2026-10-13T10:00:00Z', '2026-10-13T11:00:00Z')).toBe(true)
    expect(hasNewMedia('2026-10-13T10:00:00Z', '2026-10-13T09:00:00Z')).toBe(false)
    expect(hasNewMedia(null, '2026-10-13T09:00:00Z')).toBe(false)
    expect(hasNewMedia('2026-10-13T10:00:00Z', null)).toBe(false)
  })
})
