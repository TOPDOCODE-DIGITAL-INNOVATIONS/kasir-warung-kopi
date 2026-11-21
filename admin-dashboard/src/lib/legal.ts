/**
 * Identitas penyedia layanan untuk landing page dan dokumen legal.
 * WAJIB diisi lewat environment sebelum rilis (Vercel -> Settings -> Environment Variables):
 *   NEXT_PUBLIC_COMPANY_NAME      nama badan usaha / pemilik layanan
 *   NEXT_PUBLIC_COMPANY_ADDRESS   alamat korespondensi
 *   NEXT_PUBLIC_SUPPORT_EMAIL     email dukungan pelanggan
 *   NEXT_PUBLIC_SUPPORT_WHATSAPP  nomor WhatsApp format internasional tanpa +, mis. 6281234567890
 */
export const PRODUCT_NAME = 'KasirKu'

export const LEGAL_UPDATED_AT = '21 November 2026'

export function companyInfo() {
  const env = (key: string) => process.env[key]?.trim() || null
  return {
    name: env('NEXT_PUBLIC_COMPANY_NAME') ?? PRODUCT_NAME,
    address: env('NEXT_PUBLIC_COMPANY_ADDRESS'),
    email: env('NEXT_PUBLIC_SUPPORT_EMAIL'),
    whatsapp: env('NEXT_PUBLIC_SUPPORT_WHATSAPP')?.replace(/\D/g, '') || null,
  }
}

/** Harga default bila harga dari database belum dapat dibaca (sesuai keputusan harga awal). */
export const FALLBACK_PLANS = [
  { code: 'monthly', name: 'Bulanan', amount: 20000, interval_months: 1 },
  { code: 'yearly', name: 'Tahunan', amount: 200000, interval_months: 12 },
] as const
