'use server'

import { assertWritable } from '@/lib/billing/owner-billing'

import { revalidatePath } from 'next/cache'
import { unstable_rethrow } from 'next/navigation'
import { requireBusinessContext } from '@/lib/business-context'
import { parseMoney } from '@/lib/money'
import { isPeriod, validAmount, validDate, validateEmployee } from './domain'
import type { PayrollActionResult } from './types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Pembayaran gaji ikut memengaruhi semua halaman yang menghitung pengeluaran.
const PATHS = ['/dashboard/payroll', '/dashboard/expenses', '/dashboard/recap', '/dashboard/capital', '/dashboard']

function refresh(paths = PATHS) { for (const path of paths) revalidatePath(path) }

function fail(error: unknown, fallback: string): PayrollActionResult {
  unstable_rethrow(error)
  return { success: false, message: error instanceof Error ? error.message : fallback }
}

/** Tambah atau ubah pegawai. `id` kosong = pegawai baru. */
export async function saveEmployee(form: FormData): Promise<PayrollActionResult> {
  try {
    await assertWritable()
    const business = String(form.get('business_id') ?? ''), id = String(form.get('id') ?? '').trim()
    if (id && !UUID_RE.test(id)) throw new Error('Pegawai tidak valid.')
    const fields = validateEmployee({
      name: form.get('name'), job_title: form.get('job_title'), note: form.get('note'),
      base_salary: parseMoney(String(form.get('base_salary') ?? '')),
    })
    const { supabase } = await requireBusinessContext(business)
    const row = { ...fields, business_id: business, updated_at: new Date().toISOString() }
    const { data, error } = id
      ? await supabase.from('employees').update(row).eq('id', id).eq('business_id', business).select('id')
      : await supabase.from('employees').insert(row).select('id')
    if (error) throw new Error('Data pegawai belum berhasil disimpan.')
    if (!data?.length) throw new Error('Pegawai tidak ditemukan di cabang aktif. Muat ulang halaman.')
    refresh(['/dashboard/payroll'])
    return { success: true, message: id ? 'Data pegawai diperbarui.' : 'Pegawai ditambahkan.' }
  } catch (error) { return fail(error, 'Data pegawai belum berhasil disimpan.') }
}

/** Nonaktifkan pegawai yang keluar (riwayat gajinya tetap ada), atau aktifkan kembali. */
export async function setEmployeeActive(form: FormData): Promise<PayrollActionResult> {
  try {
    await assertWritable()
    const business = String(form.get('business_id') ?? ''), id = String(form.get('id') ?? ''), active = form.get('active') === 'true'
    if (!UUID_RE.test(id)) throw new Error('Pegawai tidak valid.')
    const { supabase } = await requireBusinessContext(business)
    const { data, error } = await supabase.from('employees').update({ is_active: active, updated_at: new Date().toISOString() })
      .eq('id', id).eq('business_id', business).select('id')
    if (error) throw new Error('Status pegawai belum berhasil diubah.')
    if (!data?.length) throw new Error('Pegawai tidak ditemukan di cabang aktif. Muat ulang halaman.')
    refresh(['/dashboard/payroll'])
    return { success: true, message: active ? 'Pegawai diaktifkan kembali.' : 'Pegawai dinonaktifkan.' }
  } catch (error) { return fail(error, 'Status pegawai belum berhasil diubah.') }
}

/** Hapus pegawai yang belum pernah digaji (mis. salah input). Yang sudah digaji cukup dinonaktifkan. */
export async function deleteEmployee(form: FormData): Promise<PayrollActionResult> {
  try {
    await assertWritable()
    const business = String(form.get('business_id') ?? ''), id = String(form.get('id') ?? '')
    if (!UUID_RE.test(id)) throw new Error('Pegawai tidak valid.')
    const { supabase } = await requireBusinessContext(business)
    const { count, error: countError } = await supabase.from('salary_payments').select('id', { count: 'exact', head: true })
      .eq('business_id', business).eq('employee_id', id)
    if (countError) throw new Error('Riwayat gaji pegawai belum dapat diperiksa.')
    if (count) throw new Error('Pegawai sudah punya riwayat gaji. Nonaktifkan saja agar riwayatnya tetap tersimpan.')
    const { error } = await supabase.from('employees').delete().eq('id', id).eq('business_id', business)
    if (error) throw new Error('Pegawai belum berhasil dihapus.')
    refresh(['/dashboard/payroll'])
    return { success: true, message: 'Pegawai dihapus.' }
  } catch (error) { return fail(error, 'Pegawai belum berhasil dihapus.') }
}

/** Catat pembayaran gaji; sekaligus membuat pengeluaran bulanan "Gaji Karyawan". */
export async function recordSalary(form: FormData): Promise<PayrollActionResult> {
  try {
    await assertWritable()
    const business = String(form.get('business_id') ?? ''), payment = String(form.get('payment_id') ?? ''), employee = String(form.get('employee_id') ?? '')
    const period = String(form.get('period') ?? ''), paidDate = String(form.get('paid_date') ?? ''), note = String(form.get('note') ?? '').trim()
    const amount = parseMoney(String(form.get('amount') ?? ''))
    if (!UUID_RE.test(payment) || !UUID_RE.test(employee)) throw new Error('Data pembayaran tidak valid. Buka ulang form.')
    if (!isPeriod(period)) throw new Error('Periode gaji tidak valid.')
    if (!validDate(paidDate)) throw new Error('Tanggal bayar tidak valid.')
    if (!validAmount(amount)) throw new Error('Nominal gaji harus lebih dari 0, maksimal Rp 999.999.999.')
    if (note.length > 500) throw new Error('Catatan maksimal 500 karakter.')
    const { supabase } = await requireBusinessContext(business)
    const { error } = await supabase.rpc('admin_record_salary', {
      p_business: business, p_payment: payment, p_employee: employee, p_period: period,
      p_amount: amount, p_paid_date: paidDate, p_note: note || null,
    })
    if (error) throw new Error(error.message)
    refresh()
    return { success: true, message: 'Pembayaran gaji dicatat dan masuk ke Pengeluaran.' }
  } catch (error) { return fail(error, 'Pembayaran gaji belum berhasil dicatat.') }
}

/** Batalkan pembayaran gaji (salah nominal/pegawai); pengeluarannya ikut terhapus. */
export async function cancelSalary(form: FormData): Promise<PayrollActionResult> {
  try {
    await assertWritable()
    const business = String(form.get('business_id') ?? ''), payment = String(form.get('payment_id') ?? '')
    if (!UUID_RE.test(payment)) throw new Error('Pembayaran gaji tidak valid.')
    const { supabase } = await requireBusinessContext(business)
    const { error } = await supabase.rpc('admin_cancel_salary', { p_business: business, p_payment: payment })
    if (error) throw new Error(error.message)
    refresh()
    return { success: true, message: 'Pembayaran gaji dibatalkan. Pengeluarannya sudah dihapus.' }
  } catch (error) { return fail(error, 'Pembayaran gaji belum berhasil dibatalkan.') }
}
