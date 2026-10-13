import { describe, expect, it } from 'vitest'
import { framePath, framePaths, mediaPaths } from '@/lib/media/paths'

describe('media paths', () => {
  it('builds photo and video paths', () => {
    expect(mediaPaths('e1', 'm1', 'photo', 'jpg')).toEqual({ full: 'events/e1/m1/full.jpg', thumb: 'events/e1/m1/thumb.jpg' })
    expect(mediaPaths('e1', 'm1', 'video', 'mov')).toEqual({ full: 'events/e1/m1/video.mov', thumb: 'events/e1/m1/poster.jpg' })
  })

  it('numbers frames from 1 with 4 digits', () => {
    expect(framePath('e1', 'm1', 7)).toBe('events/e1/m1/frames/0007.jpg')
    expect(framePaths('e1', 'm1', 2)).toEqual(['events/e1/m1/frames/0001.jpg', 'events/e1/m1/frames/0002.jpg'])
  })
})
