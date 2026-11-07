import { headers } from 'next/headers'

/** URL publik aplikasi (mis. https://kasir-warkop.vercel.app) dari header request. */
export async function getSiteUrl(): Promise<string> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}
