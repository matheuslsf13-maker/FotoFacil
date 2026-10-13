import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'FotoFácil',
  description: 'Encontre suas fotos do evento pelo rosto.',
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1 }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-3xl px-4 pb-8 text-center text-xs text-gray-500">
          <Link href="/termos" className="underline">
            Termos de uso
          </Link>{' '}
          ·{' '}
          <Link href="/privacidade" className="underline">
            Privacidade
          </Link>
        </footer>
      </body>
    </html>
  )
}
