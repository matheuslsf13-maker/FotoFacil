import { addDays, daysUntil } from './dates'

export interface EventAvailability {
  status: string
  expires_at: string
}

export function isEventAvailable(event: EventAvailability, today: string): boolean {
  return event.status === 'active' && event.expires_at >= today
}

export function eventDays(startDate: string, endDate: string): string[] {
  const days: string[] = []
  for (let day = startDate; day <= endDate && days.length < 60; day = addDays(day, 1)) days.push(day)
  return days
}

export function expiryWarning(event: EventAvailability, today: string): string | null {
  if (!isEventAvailable(event, today)) return null
  const left = daysUntil(today, event.expires_at)
  if (left > 3) return null
  if (left === 0) return 'Hoje é o último dia: as fotos deste evento serão excluídas nesta madrugada.'
  return `As fotos deste evento serão excluídas em ${left} ${left === 1 ? 'dia' : 'dias'}.`
}
