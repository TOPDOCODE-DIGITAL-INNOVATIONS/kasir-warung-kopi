import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Kasir Warung Kopi',
  description: 'Dashboard owner & aplikasi kasir warung kopi',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className="h-full antialiased">
      <body className="min-h-full bg-gray-50 text-gray-900">{children}</body>
    </html>
  )
}
