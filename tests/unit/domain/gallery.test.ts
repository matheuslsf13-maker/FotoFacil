import { describe, expect, it } from 'vitest'
import { chunk, distinctDays, downloadName, extOf, filterMedia, type GalleryItem } from '@/lib/domain/gallery'

const item = (id: string, type: 'photo' | 'video', takenOn: string): GalleryItem => ({
  id,
  type,
  takenOn,
  ext: type === 'photo' ? 'jpg' : 'mp4',
  thumbUrl: `t/${id}`,
  fullUrl: `f/${id}`,
})

const items = [item('a', 'photo', '2026-10-12'), item('b', 'video', '2026-10-12'), item('c', 'photo', '2026-10-13')]

describe('gallery helpers', () => {
  it('filters by type and day', () => {
    expect(filterMedia(items, { type: 'all', day: 'all' }).map(i => i.id)).toEqual(['a', 'b', 'c'])
    expect(filterMedia(items, { type: 'video', day: 'all' }).map(i => i.id)).toEqual(['b'])
    expect(filterMedia(items, { type: 'photo', day: '2026-10-12' }).map(i => i.id)).toEqual(['a'])
  })

  it('lists distinct days in order', () => {
    expect(distinctDays([items[2], items[0], items[1]])).toEqual(['2026-10-12', '2026-10-13'])
  })

  it('names downloads by day and position', () => {
    expect(downloadName(items[0], 0)).toBe('fotofacil-2026-10-12-001.jpg')
    expect(downloadName(items[1], 41)).toBe('fotofacil-2026-10-12-042.mp4')
  })

  it('splits lists in chunks and reads extensions', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(extOf('events/e/m/video.MOV')).toBe('mov')
    expect(extOf('events/e/m/full.jpg')).toBe('jpg')
  })
})
