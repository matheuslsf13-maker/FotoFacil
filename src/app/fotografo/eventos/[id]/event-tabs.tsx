import Link from 'next/link'

const TABS = [
  ['pulseiras', 'Pulseiras'],
  ['fotos', 'Fotos e vídeos'],
  ['config', 'Configurações'],
] as const

export function EventTabs({ eventId, active }: { eventId: string; active: string }) {
  return (
    <nav className="flex gap-2 border-b text-sm">
      {TABS.map(([key, label]) => (
        <Link
          key={key}
          href={`/fotografo/eventos/${eventId}?aba=${key}`}
          className={`-mb-px border-b-2 px-3 py-2 ${active === key ? 'border-pink-600 font-medium' : 'border-transparent text-gray-600'}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  )
}
