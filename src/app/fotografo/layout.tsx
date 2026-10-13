import Link from 'next/link'
import type { ReactNode } from 'react'
import { signOut } from '@/app/login/actions'
import { requirePhotographer } from '@/lib/auth/guards'

export default async function PhotographerLayout({ children }: { children: ReactNode }) {
  await requirePhotographer()
  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-3 text-sm">
        <Link href="/fotografo" className="rounded-md px-2 py-1 hover:bg-gray-200">
          Eventos
        </Link>
        <Link href="/fotografo/perfil" className="rounded-md px-2 py-1 hover:bg-gray-200">
          Meu perfil
        </Link>
        <form action={signOut} className="ml-auto">
          <button className="text-gray-600 underline">Sair</button>
        </form>
      </nav>
      {children}
    </div>
  )
}
