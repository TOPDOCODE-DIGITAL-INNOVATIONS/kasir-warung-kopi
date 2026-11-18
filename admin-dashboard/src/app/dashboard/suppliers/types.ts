export type Supplier = {
  id: string
  code: string | null
  name: string
  contact_name: string | null
  email: string | null
  phone: string | null
  address: string | null
  notes: string | null
  is_active: boolean
  updated_at: string
}

export type SupplierTransaction = {
  id: string
  kind: 'purchase' | 'expense'
  date: string
  monthly: boolean
  business: string
  label: string
  reference: string | null
  amount: number
  currency: string
}

export type HistoryCursor = { purchases: number; expenses: number }
export type SupplierHistory = { rows: SupplierTransaction[]; next: HistoryCursor | null; error?: string }
