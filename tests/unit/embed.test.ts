import { describe, expect, it } from 'vitest'
import { one } from '@/lib/supabase/embed'

describe('one', () => {
  it('reads a many-to-one embed whether it arrives as an object or an array', () => {
    expect(one({ name: 'Ana' })).toEqual({ name: 'Ana' })
    expect(one([{ name: 'Ana' }])).toEqual({ name: 'Ana' })
    expect(one([])).toBeNull()
    expect(one(null)).toBeNull()
    expect(one(undefined)).toBeNull()
  })
})
