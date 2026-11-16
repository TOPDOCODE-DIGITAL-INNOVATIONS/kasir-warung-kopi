import type { StockEvent } from './types'

export type Row = Record<string, unknown>
export const isRow = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v)
export const uuid = (v: string) => /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(v)
export const number = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : 0
const SCALE = BigInt(1_000_000)

/** Fixed six decimal places for stock/cost calculations; do not multiply binary floats. */
export function scaled(value: string | number): bigint {
  const source = typeof value === 'number' ? value.toFixed(6) : value
  if (!/^\d+(?:\.\d{1,6})?$/.test(source)) throw new Error('Gunakan angka positif dengan maksimal 6 angka desimal.')
  const [integer, fraction = ''] = source.split('.')
  return BigInt(integer) * SCALE + BigInt(fraction.padEnd(6, '0'))
}
export function decimal(value: bigint): string {
  const sign = value < 0 ? '-' : ''
  const n = value < 0 ? -value : value
  return `${sign}${n / SCALE}.${String(n % SCALE).padStart(6, '0')}`
}
export function amount(value: unknown, label: string, positive = false): string {
  const text = String(value ?? '').trim()
  let n: bigint
  try { n = scaled(text) } catch { throw new Error(`${label}: gunakan angka dengan maksimal 6 desimal.`) }
  if (n > BigInt(999_999_999) * SCALE || (positive && n === BigInt(0))) throw new Error(`${label} harus ${positive ? 'lebih dari nol dan ' : ''}maksimal 999.999.999.`)
  return decimal(n)
}
export function multiply(a: string | number, b: string | number): string {
  return decimal((scaled(a) * scaled(b) + SCALE / BigInt(2)) / SCALE)
}
export function addStock(stock: number, quantity: string): number {
  if (stock === -1) return -1
  const total = scaled(stock) + scaled(quantity)
  if (total > BigInt(999_999_999) * SCALE) throw new Error('Stok akhir melebihi batas yang diperbolehkan.')
  return Number(decimal(total))
}
export function stockChange(stock: number, mode: string, quantity: string): number {
  if (stock < 0) throw new Error('Pelacakan stok tidak aktif.')
  if (!['count', 'usage', 'damage', 'addition'].includes(mode)) throw new Error('Pilih jenis pencatatan stok.')
  const qty = scaled(amount(quantity, 'Jumlah', mode !== 'count'))
  const result = mode === 'count' ? qty : scaled(stock) + (mode === 'addition' ? qty : -qty)
  if (result < BigInt(0)) throw new Error('Jumlah pengurangan melebihi stok tercatat.')
  if (result > BigInt(999_999_999) * SCALE) throw new Error('Stok akhir melebihi batas.')
  return Number(decimal(result))
}
export function metadata(raw: unknown): Row {
  return isRow(raw) && isRow(raw._inventory) ? raw._inventory : { version: 1, events: [] }
}
export function events(raw: unknown): StockEvent[] {
  const list = metadata(raw).events
  return Array.isArray(list) ? list.filter((v): v is StockEvent => isRow(v) && typeof v.id === 'string' && typeof v.kind === 'string') : []
}
export function withEvent(raw: unknown, event: StockEvent, pending = false): Row {
  const meta = { ...metadata(raw), version: 1, events: [...events(raw).filter(e => e.id !== event.id), event] }
  const next: Row = { ...meta }
  if (pending) next.pending = event.id
  else if (next.pending === event.id) delete next.pending
  return { ...(isRow(raw) ? raw : {}), _inventory: next }
}
export function productForPos(product: Row, previous: unknown): Row {
  const raw = isRow(product.raw) ? product.raw : {}
  const extra = isRow(previous) ? previous : raw
  const { _inventory: _private, ...publicFields } = extra
  void _private
  return {
    ...publicFields, id: product.id, name: product.name, price: number(product.price),
    costPrice: product.cost_price === null ? undefined : number(product.cost_price),
    stock: number(product.stock), categoryId: product.category_id || 'uncategorized',
    description: product.description || '', isAvailable: product.is_available !== false,
  }
}
export function summarizeSales(rows: Row[]): Map<string, { quantity: number; amount: number }> {
  const totals = new Map<string, { quantity: bigint; amount: bigint }>()
  const signed = (n: number) => n < 0 ? -scaled(-n) : scaled(n)
  for (const tx of rows) {
    if (tx.status && tx.status !== 'completed') continue
    if (!Array.isArray(tx.items)) continue
    for (const item of tx.items) {
      if (!isRow(item) || !isRow(item.product) || typeof item.product.id !== 'string') continue
      const key = `${tx.business_id}:${item.product.id}`
      const total = totals.get(key) ?? { quantity: BigInt(0), amount: BigInt(0) }
      total.quantity += signed(number(item.quantity))
      total.amount += signed(number(item.totalPrice))
      totals.set(key, total)
    }
  }
  return new Map([...totals].map(([key, value]) => [key, { quantity: Number(decimal(value.quantity)), amount: Number(decimal(value.amount)) }]))
}
