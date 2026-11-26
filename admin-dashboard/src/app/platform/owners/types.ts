import type { AccountStatus } from '@/lib/platform-account'

export type OwnerFilters = { search: string; status: AccountStatus | ''; page: number }

export type OwnerAccount = {
  id: string
  name: string | null
  email: string | null
  status: AccountStatus
  created_at: string | null
  email_confirmed: boolean
  branch_count: number
}

export type OwnerDetail = OwnerAccount & {
  last_sign_in_at: string | null
  branches: { id: string; name: string; created_at: string }[]
}

export type OwnerActivity = {
  totals: {
    branches: number; active_branches_7d: number; transactions_30d: number; revenue_30d: number
    transactions_total: number; last_transaction_at: string | null; last_synced_at: string | null; products: number
  }
  daily: { day: string; transactions: number; revenue: number }[]
  branches: {
    id: string; name: string; created_at: string; last_synced_at: string | null; last_device_code: string | null
    transactions_30d: number; revenue_30d: number; last_transaction_at: string | null; product_count: number; open_shifts: number
  }[]
  events: { at: string; kind: string; branch: string | null; detail: string | null }[]
}
