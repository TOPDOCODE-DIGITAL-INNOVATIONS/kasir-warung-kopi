import type { User } from '@supabase/supabase-js'

export type PlatformRole = 'owner' | 'super_admin'
export type AccountStatus = 'active' | 'inactive'

// user_metadata is intentionally never consulted for authorization.
// Missing fields retain legacy owner access during an additive DB/app rollout.
// An explicit unknown value fails closed instead of becoming an owner/admin.
export function platformAccount(user: Pick<User, 'app_metadata'>): {
  role: PlatformRole; status: AccountStatus
} {
  const role: unknown = user.app_metadata?.platform_role ?? 'owner'
  const status: unknown = user.app_metadata?.account_status ?? 'active'
  if (role !== 'owner' && role !== 'super_admin') throw new Error('Role akun platform tidak valid. Hubungi pengelola.')
  if (status !== 'active' && status !== 'inactive') throw new Error('Status akun platform tidak valid. Hubungi pengelola.')
  return { role, status }
}

export function platformRoleLabel(role: PlatformRole) {
  return role === 'super_admin' ? 'Super Admin' : 'Owner'
}
