function capitalize(word: string): string {
  return word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1).toLocaleLowerCase('pt-BR')
}

export function displayName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  const first = capitalize(parts[0])
  if (parts.length === 1) return first
  const last = parts[parts.length - 1]
  return `${first} ${last.charAt(0).toLocaleUpperCase('pt-BR')}.`
}

export interface NameListRow {
  registrationId: string
  fullName: string
}

export interface NameListItem {
  registrationId: string
  label: string
}

export function buildNameList(rows: NameListRow[]): NameListItem[] {
  return rows
    .map(row => ({ registrationId: row.registrationId, label: displayName(row.fullName) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
}

function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

export function matchesNameFilter(label: string, filter: string): boolean {
  return fold(label).includes(fold(filter.trim()))
}
