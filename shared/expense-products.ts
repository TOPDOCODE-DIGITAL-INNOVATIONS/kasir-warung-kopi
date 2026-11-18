export type ExpensePurchaseProduct = {
  id: string
  name: string
  stock: number
  unitCode: string
  units: { id: string; label: string; factor: number }[]
}

export type ExpensePurchaseCatalog = {
  businessId: string
  products: ExpensePurchaseProduct[]
  suppliers?: { id: string; name: string }[]
  notes?: string[]
}

export type PendingExpensePurchase = {
  businessId: string
  productId?: string
  itemUnitId?: string
  operationId?: string
  supplierId?: string
}

export function isExpenseQuantity(value: unknown): value is number {
  return typeof value === 'number' && value > 0 && value <= 999_999_999
    && /^\d{1,9}(\.\d{1,6})?$/.test(String(value))
}

export function expenseNoteSuggestions(notes: Iterable<string | null | undefined>, term = '', limit = 8): string[] {
  const query = term.trim().toLocaleLowerCase('id')
  const seen = new Set<string>()
  const matches: string[] = []
  for (const note of notes) {
    const label = note?.trim()
    const key = label?.toLocaleLowerCase('id')
    if (!label || !key || seen.has(key) || !key.includes(query)) continue
    seen.add(key)
    matches.push(label)
    if (matches.length === limit) break
  }
  return matches
}
