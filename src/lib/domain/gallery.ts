export type TypeFilter = 'all' | 'photo' | 'video'

export interface GalleryItem {
  id: string
  type: 'photo' | 'video'
  takenOn: string
  ext: string
  thumbUrl: string
  fullUrl: string
}

export function filterMedia(items: GalleryItem[], filter: { type: TypeFilter; day: string }): GalleryItem[] {
  return items.filter(
    item => (filter.type === 'all' || item.type === filter.type) && (filter.day === 'all' || item.takenOn === filter.day),
  )
}

export function distinctDays(items: GalleryItem[]): string[] {
  return [...new Set(items.map(item => item.takenOn))].sort()
}

export function downloadName(item: GalleryItem, index: number): string {
  return `fotofacil-${item.takenOn}-${String(index + 1).padStart(3, '0')}.${item.ext}`
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export function extOf(path: string): string {
  return path.split('.').pop()?.toLowerCase() || 'jpg'
}
