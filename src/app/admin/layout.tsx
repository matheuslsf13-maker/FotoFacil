import Link from 'next/link'
import type { ReactNode } from 'react'
import { signOut } from '@/app/login/actions'
import { requireAdmin } from '@/lib/auth/guards'

const LINKS = [
  ['/admin', 'Painel'],
  ['/admin/fotografos', 'Fotógrafos'],
  ['/admin/clientes', 'Clientes'],
  ['/admin/eventos', 'Eventos'],
  ['/admin/fechamentos', 'Fechamentos'],
  ['/admin/configuracoes', 'Configurações'],
] as const

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin()
  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap items-center gap-3 text-sm">
        {LINKS.map(([href, label]) => (
          <Link key={href} href={href} className="rounded-md px-2 py-1 hover:bg-gray-200">
            {label}
          </Link>
        ))}
        <form action={signOut} className="ml-auto">
          <button className="text-gray-600 underline">Sair</button>
        </form>
      </nav>
      {children}
    </div>
  )
}
