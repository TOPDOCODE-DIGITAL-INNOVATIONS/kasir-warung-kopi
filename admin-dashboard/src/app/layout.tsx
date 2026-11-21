import type { Metadata } from 'next'
import { Fraunces, Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'

// Database Supabase ada di Sydney (ap-southeast-2). Jalankan semua server function
// di region Vercel yang sama agar tiap query tidak menyeberang ke US (default iad1).
export const preferredRegion = 'syd1'

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta', display: 'swap' })
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', display: 'swap', axes: ['opsz'] })

export const metadata: Metadata = {
  title: 'KasirKu',
  description: 'Aplikasi kasir & laporan usaha untuk warung kopi, kafe, dan UMKM',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className={`${jakarta.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="min-h-full bg-canvas text-gray-900">{children}</body>
    </html>
  )
}
