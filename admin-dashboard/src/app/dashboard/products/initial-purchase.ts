import { amount, decimal, scaled, uuid } from './domain'

export type InitialPurchase = { date: string; quantity: string; total: string; supplier: string | null; note: string }

export function initialPurchase(form: FormData): InitialPurchase | null {
  if (form.get('initial_purchase') !== 'on') return null
  const date = String(form.get('purchase_date') ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith('0000') || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error('Tanggal pembelian pertama tidak valid.')
  const quantity = amount(form.get('purchase_quantity'), 'Jumlah pembelian pertama', true)
  const total = amount(form.get('purchase_total'), 'Total pembelian pertama', true)
  if (scaled(total) % BigInt(10000) !== BigInt(0)) throw new Error('Total pembelian maksimal 2 angka desimal.')
  const supplier = String(form.get('purchase_supplier') ?? '').trim() || null
  if (supplier && !uuid(supplier)) throw new Error('Supplier pembelian tidak valid.')
  const note = String(form.get('purchase_note') ?? '').trim() || 'Pembelian pertama'
  if (note.length > 500) throw new Error('Catatan pembelian maksimal 500 karakter.')
  return { date, quantity, total, supplier, note }
}

export function initialUnitCost(purchase: InitialPurchase): string {
  const quantity = scaled(purchase.quantity)
  return decimal((scaled(purchase.total) * BigInt(1_000_000) + quantity / BigInt(2)) / quantity)
}
