export type ExpenseOptions = {
  suppliers: { id: string; name: string }[]
}

export type ExpenseProduct = {
  id: string; name: string; stock: number; version: string; unitCode: string
  units: { id: string; label: string; factor: number }[]
}
export type ExpenseProductSearch = { products: ExpenseProduct[]; hasMore: boolean; error?: string }

export type EditableExpense = {
  id: string; businessId: string; scope: 'daily' | 'monthly'; date: string
  category: string; amount: number; note: string; version: string
  financialLock: string | null
  purchaseLinked: boolean; fromDrawer: boolean
  /** Product lines of the same purchase document, cancelled together by a correction. */
  purchaseLineId: string | null; purchaseItems: { name: string; amount: number }[]
}
