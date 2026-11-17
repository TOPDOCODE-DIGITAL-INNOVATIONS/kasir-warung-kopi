export type ExpenseOptions = {
  products: { id: string; name: string; stock: number; version: string; unitCode: string }[]
  units: { id: string; productId: string; label: string; factor: number }[]
  suppliers: { id: string; name: string }[]
}

export type EditableExpense = {
  id: string; businessId: string; scope: 'daily' | 'monthly'; date: string
  category: string; amount: number; note: string; version: string
  financialLock: string | null
  purchaseLinked: boolean; fromDrawer: boolean
}
