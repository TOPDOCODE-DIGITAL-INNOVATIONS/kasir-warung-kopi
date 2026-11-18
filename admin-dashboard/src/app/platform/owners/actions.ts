'use server'

import { revalidatePath } from 'next/cache'
import { requireSuperAdmin } from '@/lib/platform-auth'
import { platformDb } from '../db'
import type { OwnerAccount, OwnerDetail, OwnerFilters } from './types'

const pageSize = 25
const ownerPath = '/platform/owners'

const ownerIdPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

function isAccountStatus(status: unknown): status is 'active' | 'inactive' {
  return status === 'active' || status === 'inactive'
}

export async function getOwnerPage(params: { q?: unknown; status?: unknown; page?: unknown }) {
  const { user } = await requireSuperAdmin()
  const filters: OwnerFilters = {
    search: typeof params.q === 'string' ? params.q.trim().slice(0, 120) : '',
    status: isAccountStatus(params.status) ? params.status : '',
    page: pageNumber(params.page),
  }
  const { data, error } = await platformDb().rpc('platform_list_owners_with_branches', {
    p_actor: user.id,
    p_search: filters.search,
    p_status: filters.status || null,
    p_offset: (filters.page - 1) * pageSize,
    p_limit: pageSize + 1,
  })
  if (error) throw new Error('Daftar akun Owner belum berhasil dimuat.')
  const owners: OwnerAccount[] = data
  return { filters, owners: owners.slice(0, pageSize), hasNext: owners.length > pageSize }
}

function pageNumber(value: unknown) {
  const page = typeof value === 'string' ? Number(value) : 1
  return Number.isSafeInteger(page) && page > 0 && (page - 1) * pageSize <= 2_147_483_647 ? page : 1
}

export async function getOwnerDetail(id: string, requestedPage: unknown) {
  const { user } = await requireSuperAdmin()
  if (!ownerIdPattern.test(id)) return null

  const page = pageNumber(requestedPage)
  const { data, error } = await platformDb().rpc('platform_get_owner_detail', {
    p_actor: user.id, p_owner: id, p_offset: (page - 1) * pageSize, p_limit: pageSize,
  })
  if (error) throw new Error('Detail Owner belum berhasil dimuat.')
  const owner: OwnerDetail | null = data
  return owner ? { owner, page, hasNext: page * pageSize < owner.branch_count } : null
}

export async function setOwnerStatus(formData: FormData) {
  const { user } = await requireSuperAdmin()
  const id = formData.get('id')
  const previous = formData.get('previous_status')
  const status = formData.get('status')
  if (typeof id !== 'string' || !ownerIdPattern.test(id)
    || !isAccountStatus(previous) || !isAccountStatus(status) || status === previous) {
    return { success: false, message: 'Perubahan status Owner tidak valid.' }
  }

  const { data, error } = await platformDb().rpc('platform_set_owner_status', {
    p_actor: user.id,
    p_owner: id,
    p_expected_status: previous,
    p_status: status,
  })
  if (error) return { success: false, message: 'Status akun belum berhasil disimpan. Silakan coba lagi.' }
  if (!data) return { success: false, message: 'Akun atau statusnya sudah berubah. Muat ulang daftar sebelum mencoba lagi.' }

  revalidatePath(ownerPath)
  revalidatePath('/platform')
  return { success: true, message: status === 'active' ? 'Status Owner berhasil diaktifkan.' : 'Status Owner berhasil dinonaktifkan.' }
}
