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
