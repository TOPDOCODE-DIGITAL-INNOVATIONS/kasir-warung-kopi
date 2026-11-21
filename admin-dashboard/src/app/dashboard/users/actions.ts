'use server'

import { getCurrentOwnerAccess, READ_ONLY_MESSAGE } from '@/lib/billing/owner-billing'

import { revalidatePath } from 'next/cache'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createClient } from '@/utils/supabase/server'
import { getBusinessContext } from '@/lib/business-context'
import { NEW_BRANCH_CATEGORIES, newBranchSettings } from '../../../../../shared/branch-defaults'
import { AVATAR_COLORS, CASHIER_ROLES, avatarColor, type CashierConfiguration, type CashierRow, type UserActionResult } from './types'

type Row = Record<string, unknown>
type Supabase = Awaited<ReturnType<typeof createClient>>
const isRow = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value)
const isUuid = (value: string) => /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value)

async function readBusinesses(supabase: Supabase, ownerId: string, includeCashiers: boolean, businessId: string | null) {
  const rows: Row[] = []
  let after: string | undefined
  while (true) {
    let query = supabase.from('businesses')
      .select(includeCashiers ? 'id,name,pos_config_updated_at,config:pos_config' : 'id,name')
      .eq('owner_id', ownerId).order('id').limit(500)
    if (businessId) query = query.eq('id', businessId)
    if (after) query = query.gt('id', after)
    const { data, error } = await query
    if (error) throw new Error('Gagal memuat data user. Muat ulang halaman untuk mencoba lagi.')
    const batch = data as unknown as Row[]
    rows.push(...batch)
    if (batch.length < 500) break
    after = String(batch[batch.length - 1].id)
  }
  return rows
}

export async function getCashierUsers(requestedBusinessId: string | null) {
  const { supabase, user, businesses: ownedBusinesses, businessId } = await getBusinessContext()
  if (requestedBusinessId && requestedBusinessId !== businessId) throw new Error('Cabang tidak sesuai dengan cabang aktif.')
  // Only the selected config is fetched; never a query per cashier.
  const configRows = businessId ? await readBusinesses(supabase, user.id, true, businessId) : []
  const businesses = ownedBusinesses.filter(b => b.id === businessId)
  const users: CashierRow[] = configRows.flatMap((business) => {
    const config = isRow(business.config) ? business.config : null
    const cashiers = Array.isArray(config?.cashiers) ? config.cashiers : []
    return cashiers.filter((cashier): cashier is Row => isRow(cashier) && typeof cashier.id === 'string' && typeof cashier.name === 'string')
      .map((cashier) => ({
        id: String(cashier.id), name: String(cashier.name), role: typeof cashier.role === 'string' ? cashier.role : '-',
        businessId: String(business.id), businessName: String(business.name), avatarColor: avatarColor(cashier.avatarColor).value,
        hasPin: !!(cashier.pinHash || cashier.pin), configVersion: typeof business.pos_config_updated_at === 'string' ? business.pos_config_updated_at : null,
      }))
  })
  users.sort((a, b) => a.businessName.localeCompare(b.businessName, 'id') || a.name.localeCompare(b.name, 'id'))
  const selected = configRows[0]
  const configuration: CashierConfiguration | null = selected ? {
    businessId: String(selected.id), businessName: String(selected.name),
    configVersion: typeof selected.pos_config_updated_at === 'string' ? selected.pos_config_updated_at : null,
    ready: validConfig(selected.config),
    empty: selected.config === null || selected.config === undefined,
  } : null
  return { businesses, users, configuration, invalidBusiness: !!businessId && !businesses.some((business) => business.id === businessId) }
}

function validConfig(config: unknown): config is Row & { cashiers: Row[] } {
  return isRow(config) && Array.isArray(config.products) && Array.isArray(config.categories)
    && isRow(config.settings) && Array.isArray(config.cashiers)
    && config.cashiers.every((cashier): cashier is Row => isRow(cashier) && typeof cashier.id === 'string')
}

export async function addCashier(formData: FormData): Promise<UserActionResult> {
  if ((await getCurrentOwnerAccess()).access.readOnly) return { success: false, message: READ_ONLY_MESSAGE }
  const fail = (message: string): UserActionResult => ({ success: false, message })
  const businessId = String(formData.get('business_id') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  const role = String(formData.get('role') ?? '')
  const color = String(formData.get('avatar_color') ?? '')
  const pin = String(formData.get('pin') ?? '')
  const confirmation = String(formData.get('pin_confirmation') ?? '')
  if (!isUuid(businessId) || !formData.has('config_version')) return fail('Data cabang tidak valid. Muat ulang halaman.')
  if (!name || name.length > 100) return fail('Nama wajib diisi, maksimal 100 karakter.')
  if (!CASHIER_ROLES.some((allowed) => allowed === role)) return fail('Role tidak valid.')
  if (!AVATAR_COLORS.some((allowed) => allowed.value === color)) return fail('Pilih warna avatar yang tersedia.')
  if (!/^\d{4,6}$/.test(pin)) return fail('PIN wajib 4–6 digit angka.')
  if (pin !== confirmation) return fail('Konfirmasi PIN tidak sama.')

  const { supabase, user, businessId: activeBusinessId } = await getBusinessContext()
  if (businessId !== activeBusinessId) return fail('Cabang aktif sudah berubah. Muat ulang halaman sebelum mencoba lagi.')
  const { data: business, error } = await supabase.from('businesses')
    .select('id,name,pos_config,pos_config_updated_at').eq('id', businessId).eq('owner_id', user.id).maybeSingle()
  if (error) return fail('Gagal memeriksa data cabang. Silakan coba kembali.')
  if (!business) return fail('Cabang tidak ditemukan atau tidak dapat diakses.')
  const version = business.pos_config_updated_at as string | null
  if (String(formData.get('config_version')) !== (version ?? '')) {
    return fail('Data cabang sudah berubah. Tutup dialog dan muat ulang halaman sebelum mencoba lagi.')
  }
  // Cabang kosong disiapkan dari server (menu kosong + user pertama). Konfigurasi rusak/parsial
  // tidak pernah ditimpa agar menu/pengaturan perangkat tidak hilang.
  const empty = business.pos_config === null || business.pos_config === undefined
  if (!empty && !validConfig(business.pos_config)) return fail('Konfigurasi kasir cabang tidak valid. Sinkronkan aplikasi kasir lalu coba lagi.')
  if (empty && role !== 'Owner') return fail('Cabang ini belum punya user. User pertama harus memiliki role Owner.')
  const config = empty
    ? { products: [], categories: NEW_BRANCH_CATEGORIES, cashiers: [] as Row[], settings: newBranchSettings(String(business.name ?? '')) }
    : business.pos_config as Row & { cashiers: Row[] }
  if (!config.cashiers.some((cashier) => cashier.role === 'Owner') && role !== 'Owner') {
    return fail('Profil pertama pada cabang harus memiliki role Owner.')
  }
  // Same salt:PIN SHA-256 representation as app-kasir/security.ts; no plaintext PIN.
  const pinSalt = randomBytes(8).toString('hex')
  const cashier = {
    id: `c-${randomUUID()}`, name, role, avatarColor: color, isActive: false,
    pinSalt, pinHash: createHash('sha256').update(`${pinSalt}:${pin}`).digest('hex'),
  }
  const updatedAt = new Date(Math.max(Date.now(), version ? new Date(version).getTime() + 1 : 0)).toISOString()
  let update = supabase.from('businesses').update({
    pos_config: { ...config, cashiers: [...config.cashiers, cashier] }, pos_config_updated_at: updatedAt,
  }).eq('id', businessId).eq('owner_id', user.id)
  update = version ? update.eq('pos_config_updated_at', version) : update.is('pos_config_updated_at', null)
  const { data: changed, error: updateError } = await update.select('id')
  if (updateError) return fail('User belum berhasil ditambahkan. Silakan coba kembali.')
  if (!changed?.length) return fail('Data cabang sudah berubah. Muat ulang halaman sebelum mencoba lagi.')
  revalidatePath('/dashboard/users')
  return { success: true, message: 'User berhasil ditambahkan. Profil dan PIN diterapkan setelah perangkat kasir melakukan sinkronisasi.' }
}

async function changeCashier(formData: FormData, remove: boolean): Promise<UserActionResult> {
  if ((await getCurrentOwnerAccess()).access.readOnly) return { success: false, message: READ_ONLY_MESSAGE }
  const fail = (message: string): UserActionResult => ({ success: false, message })
  const businessId = String(formData.get('business_id') ?? '')
  const cashierId = String(formData.get('cashier_id') ?? '')
  if (!isUuid(businessId) || !cashierId || !formData.has('config_version')) return fail('Data user tidak valid. Muat ulang halaman.')
  const name = String(formData.get('name') ?? '').trim()
  const role = String(formData.get('role') ?? '')
  const color = String(formData.get('avatar_color') ?? '')
  if (!remove) {
    if (!name || name.length > 100) return fail('Nama wajib diisi, maksimal 100 karakter.')
    if (!CASHIER_ROLES.some((allowed) => allowed === role)) return fail('Role tidak valid.')
    if (!AVATAR_COLORS.some((allowed) => allowed.value === color)) return fail('Pilih warna avatar yang tersedia.')
  }

  const { supabase, user, businessId: activeBusinessId } = await getBusinessContext()
  if (businessId !== activeBusinessId) return fail('Cabang aktif sudah berubah. Muat ulang halaman sebelum mencoba lagi.')
  const { data: business, error } = await supabase.from('businesses')
    .select('id,pos_config,pos_config_updated_at').eq('id', businessId).eq('owner_id', user.id).maybeSingle()
  if (error) return fail('Gagal memeriksa data cabang. Silakan coba kembali.')
  if (!business) return fail('Cabang tidak ditemukan atau tidak dapat diakses.')
  const version = business.pos_config_updated_at as string | null
  if (String(formData.get('config_version')) !== (version ?? '')) {
    return fail('Data cabang sudah berubah. Tutup dialog dan muat ulang halaman sebelum mencoba lagi.')
  }
  if (!isRow(business.pos_config) || !Array.isArray(business.pos_config.cashiers)) {
    return fail('Data kasir belum tersedia. Sinkronkan aplikasi kasir terlebih dahulu.')
  }
  const config = business.pos_config
  const cashiers = config.cashiers as unknown[]
  if (!cashiers.every((cashier): cashier is Row => isRow(cashier) && typeof cashier.id === 'string')) {
    return fail('Data kasir tidak valid. Sinkronkan kembali dari aplikasi kasir.')
  }
  const targets = cashiers.filter((cashier) => cashier.id === cashierId)
  if (targets.length !== 1) return fail('User tidak ditemukan atau datanya tidak valid. Muat ulang halaman.')
  const updatedCashiers = remove
    ? cashiers.filter((cashier) => cashier.id !== cashierId)
    : cashiers.map((cashier) => cashier.id === cashierId ? { ...cashier, name, role, avatarColor: color } : cashier)
  if (!updatedCashiers.some((cashier) => cashier.role === 'Owner')) return fail('Setiap cabang harus memiliki minimal satu Owner.')

  if (remove) {
    const { data: shifts, error: shiftError } = await supabase.from('shifts').select('id')
      .eq('business_id', businessId).eq('cashier_id', cashierId).eq('status', 'open').limit(1)
    if (shiftError) return fail('Gagal memeriksa shift kasir. Silakan coba kembali.')
    if (shifts.length) return fail('User masih memiliki shift terbuka. Tutup shift dan sinkronkan aplikasi kasir terlebih dahulu.')
  }

  // Compare-and-set prevents a concurrent admin/device edit from being overwritten by this snapshot.
  const updatedAt = new Date(Math.max(Date.now(), version ? new Date(version).getTime() + 1 : 0)).toISOString()
  let update = supabase.from('businesses').update({ pos_config: { ...config, cashiers: updatedCashiers }, pos_config_updated_at: updatedAt })
    .eq('id', businessId).eq('owner_id', user.id)
  update = version ? update.eq('pos_config_updated_at', version) : update.is('pos_config_updated_at', null)
  const { data: changed, error: updateError } = await update.select('id')
  if (updateError) return fail('Perubahan belum berhasil disimpan. Silakan coba kembali.')
  if (!changed.length) return fail('Data cabang sudah berubah. Tutup dialog dan muat ulang halaman sebelum mencoba lagi.')
  revalidatePath('/dashboard/users')
  return { success: true, message: remove ? 'User berhasil dihapus. Perubahan diterapkan di perangkat kasir setelah sinkronisasi.' : 'User berhasil diperbarui. Perubahan diterapkan di perangkat kasir setelah sinkronisasi.' }
}

export async function updateCashier(formData: FormData) {
  return changeCashier(formData, false)
}

export async function deleteCashier(formData: FormData) {
  return changeCashier(formData, true)
}
