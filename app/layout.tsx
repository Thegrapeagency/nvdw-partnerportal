import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Partner Portal — Nacht van de Wijn 2026',
  description: 'Partner omgeving Nacht van de Wijn',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  )
}
