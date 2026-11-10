export const CASHIER_ROLES = ['Kasir', 'Supervisor', 'Owner'] as const
export type CashierRole = (typeof CASHIER_ROLES)[number]

export const AVATAR_COLORS = [
  { value: 'bg-amber-600 text-white', label: 'Amber', background: '#d97706' },
  { value: 'bg-indigo-600 text-white', label: 'Indigo', background: '#4f46e5' },
  { value: 'bg-emerald-600 text-white', label: 'Hijau', background: '#059669' },
  { value: 'bg-rose-600 text-white', label: 'Merah muda', background: '#e11d48' },
  { value: 'bg-violet-600 text-white', label: 'Ungu', background: '#7c3aed' },
  { value: 'bg-[#3E2723] text-white', label: 'Cokelat', background: '#3e2723' },
] as const

export function avatarColor(value: unknown) {
  return AVATAR_COLORS.find((color) => color.value === value) ?? AVATAR_COLORS[5]
}

// Only these fields cross the server/client boundary. PINs and hashes stay on the server.
export type CashierRow = {
  id: string
  name: string
  role: string
  businessId: string
  businessName: string
  avatarColor: string
  hasPin: boolean
  configVersion: string | null
}

export type UserActionResult = { success: boolean; message: string }
