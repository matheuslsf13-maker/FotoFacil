import { describe, expect, it } from 'vitest'
import { mapLimit, withRetry } from '@/lib/async'

describe('mapLimit', () => {
  it('keeps order and never exceeds the concurrency limit', async () => {
    let running = 0
    let peak = 0
    const out = await mapLimit([30, 10, 20, 5], 2, async ms => {
      running += 1
      peak = Math.max(peak, running)
      await new Promise(resolve => setTimeout(resolve, ms))
      running -= 1
      return ms * 2
    })
    expect(out).toEqual([60, 20, 40, 10])
    expect(peak).toBe(2)
  })

  it('handles an empty list', async () => {
    expect(await mapLimit([], 3, async (x: number) => x)).toEqual([])
  })
})

describe('withRetry', () => {
  it('retries until it succeeds', async () => {
    let calls = 0
    const result = await withRetry(
      async () => {
        calls += 1
        if (calls < 3) throw new Error('flaky')
        return 'ok'
      },
      3,
      0,
    )
    expect(result).toBe('ok')
    expect(calls).toBe(3)
  })

  it('throws the last error after the last attempt', async () => {
    await expect(withRetry(async () => Promise.reject(new Error('nope')), 2, 0)).rejects.toThrow('nope')
  })
})
