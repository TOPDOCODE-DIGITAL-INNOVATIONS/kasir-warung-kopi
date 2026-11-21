export type Branch = { id: string; name: string; categories: { id: string; name: string }[] }
export type Unit = { id: string; code: string; name: string }
export type ItemUnit = { id: string; productId: string; label: string; factor: number }
export type Supplier = { id: string; name: string }
export type ProductRow = {
  id: string; inventoryId: string; businessId: string; businessName: string
  name: string; sku: string; description: string; categoryId: string
  baseUnitId: string; unitCode: string; canBuy: boolean; canSell: boolean
  price: number; cost: number | null; costVerified: boolean; stock: number; minStock: number; available: boolean
  version: string; soldQuantity: number; soldAmount: number; boughtQuantity: number; boughtAmount: number
  stockUpdatedAt: string | null
  imageUrl: string | null
  hasRecipe: boolean; pendingOperation: string | null
}
export type ProductPageData = {
  businesses: Branch[]; units: Unit[]; suppliers: Supplier[]; itemUnits: ItemUnit[]
  products: ProductRow[]; invalidBusiness: boolean
}
export type ActionResult = { success: boolean; message: string; refresh?: boolean }
export type StockEvent = {
  id: string; kind: 'purchase' | 'adjustment' | 'initial' | 'tracking' | 'edit' | 'archive'
  at: string; quantity: number; before: number; after: number; reason: string
  status: 'pending' | 'complete'; purchaseId?: string; fingerprint?: string
}
export type HistoryData = {
  error?: string
  events: StockEvent[]
  purchases: PurchaseHistoryRow[]
  adjustments: { id: string; mode: string; before: number; after: number; delta: number; reason: string; date: string; by: string }[]
}
export type HistoryTab = 'purchases' | 'adjustments' | 'events'
export type HistoryRequest = { tab: HistoryTab; start: string; end: string }
export type PurchaseHistoryRow = {
  id: string; source: 'purchase' | 'expense'; date: string; monthly: boolean; number: string
  supplierId: string | null; supplier: string; address: string | null
  quantity: number | null; amount: number; unitPrice: number | null; note: string
}
