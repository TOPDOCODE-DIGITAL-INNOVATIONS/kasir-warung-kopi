export type TxItem = {
  quantity?: number
  unitPrice?: number
  totalPrice?: number
  notes?: string
  product?: { name?: string; price?: number }
  selectedOptions?: { groupName?: string; choiceLabel?: string; extraPrice?: number }[]
}

export type TxEditLog = {
  at?: string
  by?: string
  reason?: string
  summary?: string
}

export type TxRow = {
  id: string
  created_at: string
  device_code: string | null
  cashier_name: string | null
  order_type: string | null
  customer_name: string | null
  customer_phone: string | null
  items: TxItem[] | null
  subtotal: number | string
  discount_amount: number | string
  discount_reason: string | null
  tax_amount: number | string
  grand_total: number | string
  payment_type: string | null
  payment_detail: string | null
  amount_paid: number | string
  change_amount: number | string
  overpay_amount: number | string | null
  status: string
  cancel_reason: string | null
  cancelled_at: string | null
  cancelled_by: string | null
  debt_status: string | null
  debt_paid_at: string | null
  debt_paid_method: string | null
  notes: string | null
  edit_history?: TxEditLog[] | null
  businesses: { name: string } | null
}

export const TX_COLUMNS =
  'id, created_at, device_code, cashier_name, order_type, customer_name, customer_phone, items, subtotal, discount_amount, discount_reason, tax_amount, grand_total, payment_type, payment_detail, amount_paid, change_amount, overpay_amount, status, cancel_reason, cancelled_at, cancelled_by, debt_status, debt_paid_at, debt_paid_method, notes, businesses(name)'
