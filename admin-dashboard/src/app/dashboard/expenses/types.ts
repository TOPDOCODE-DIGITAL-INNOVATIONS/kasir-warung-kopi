export type ExpenseOptions = {
  products: { id: string; name: string; stock: number; version: string; unitCode: string }[]
  units: { id: string; productId: string; label: string; factor: number }[]
  suppliers: { id: string; name: string }[]
}
