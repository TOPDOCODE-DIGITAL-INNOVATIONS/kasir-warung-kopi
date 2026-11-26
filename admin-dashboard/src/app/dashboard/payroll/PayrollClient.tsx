'use client'

import { useState } from 'react'
import { Banknote, Pencil, Plus, RotateCcw, Trash2, UserCheck, UserMinus, Users } from 'lucide-react'
import AdminModal from '@/components/AdminModal'
import LoadingSpinner from '@/components/LoadingSpinner'
import { Badge, EmptyState, Notice, Panel, ui } from '@/components/ui'
import { usePendingRefresh } from '@/hooks/usePendingRefresh'
import { rupiah } from '@/lib/format'
import MoneyInput from '../products/MoneyInput'
import { cancelSalary, deleteEmployee, recordSalary, saveEmployee, setEmployeeActive } from './actions'
import type { Employee, PayrollRow, SalaryPayment } from './domain'
import type { PayrollActionResult } from './types'

const input = ui.inputBare
const fmtDate = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeZone: 'UTC' })
const date = (d: string) => fmtDate.format(new Date(`${d}T00:00:00Z`))

type Props = { businessId: string; period: string; periodName: string; today: string; rows: PayrollRow[]; employees: Employee[] }
type Dialog =
  | { kind: 'employee'; employee: Employee | null }
  | { kind: 'pay'; employee: Employee }
  | { kind: 'cancel'; payment: SalaryPayment }
  | { kind: 'delete'; employee: Employee }

export default function PayrollClient({ businessId, period, periodName, today, rows, employees }: Props) {
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [flash, setFlash] = useState<PayrollActionResult | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const { refreshing, refresh } = usePendingRefresh()
  const done = (result: PayrollActionResult) => { setDialog(null); setFlash(result); refresh() }

  async function toggle(employee: Employee) {
    setBusyId(employee.id); setFlash(null)
    const form = new FormData()
    form.set('business_id', businessId); form.set('id', employee.id); form.set('active', String(!employee.is_active))
    try { const result = await setEmployeeActive(form); setFlash(result); if (result.success) refresh() }
    catch { setFlash({ success: false, message: 'Status pegawai belum berhasil diubah.' }) }
    finally { setBusyId(null) }
  }

  return (
    <div className="space-y-4">
      {flash && <Notice tone={flash.success ? 'success' : 'error'} role="status">{flash.message}</Notice>}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Panel data loading={refreshing} className="overflow-hidden lg:col-span-3" bodyClassName="" title={`Pembayaran ${periodName}`}
          description="Klik Bayar untuk mencatat gaji. Nominal terisi dari gaji pokok dan bisa diubah (mis. ada bonus atau potongan).">
          {rows.length === 0 ? (
            <EmptyState icon={Banknote} title="Belum ada pegawai aktif" description="Tambahkan pegawai di panel Daftar Pegawai terlebih dahulu." />
          ) : (
            <ul className="divide-y divide-gray-100">
              {rows.map(({ employee, payment }) => (
                <li key={employee.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 sm:px-6">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {payment?.employee_name ?? employee.name}
                      {payment ? <Badge tone="green" className="ml-2 align-middle">sudah dibayar</Badge> : <Badge tone="amber" className="ml-2 align-middle">belum</Badge>}
                      {!employee.is_active && <Badge className="ml-1.5 align-middle">nonaktif</Badge>}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {payment
                        ? [`Dibayar ${date(payment.paid_date)}`, payment.created_by, payment.note].filter(Boolean).join(' · ')
                        : [employee.job_title, `Gaji pokok ${rupiah(employee.base_salary)}`].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {payment ? <>
                      <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-gray-900">{rupiah(payment.amount)}</span>
                      <button type="button" disabled={refreshing} onClick={() => { setFlash(null); setDialog({ kind: 'cancel', payment }) }}
                        aria-label={`Batalkan gaji ${payment.employee_name}`} title="Batalkan pembayaran"
                        className="rounded-lg p-2 text-red-600 hover:bg-red-50 disabled:opacity-50"><RotateCcw className="h-4 w-4" /></button>
                    </> : (
                      <button type="button" disabled={refreshing || !employee.is_active} onClick={() => { setFlash(null); setDialog({ kind: 'pay', employee }) }}
                        className={ui.btnPrimary + ' px-3 py-2'}><Banknote className="h-4 w-4" aria-hidden="true" /> Bayar</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel data className="overflow-hidden lg:col-span-2" bodyClassName="" title="Daftar Pegawai"
          description="Pegawai yang keluar cukup dinonaktifkan agar riwayat gajinya tetap tersimpan."
          actions={<button type="button" disabled={!businessId} onClick={() => { setFlash(null); setDialog({ kind: 'employee', employee: null }) }} className={ui.btnPrimary + ' px-3 py-2'}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Tambah</button>}>
          {employees.length === 0 ? (
            <EmptyState icon={Users} title="Belum ada pegawai" description="Tambahkan pegawai beserta gaji pokoknya." />
          ) : (
            <ul className="divide-y divide-gray-100">
              {employees.map(e => (
                <li key={e.id} className={'flex items-center justify-between gap-3 px-5 py-3 sm:px-6 ' + (e.is_active ? '' : 'bg-gray-50/60')}>
                  <div className="min-w-0">
                    <p className={'truncate text-sm font-medium ' + (e.is_active ? 'text-gray-900' : 'text-gray-500')}>
                      {e.name}{!e.is_active && <Badge className="ml-2 align-middle">nonaktif</Badge>}
                    </p>
                    <p className="truncate text-xs text-gray-500">{[e.job_title, rupiah(e.base_salary) + '/bulan'].filter(Boolean).join(' · ')}</p>
                  </div>
                  <div className="flex shrink-0 items-center">
                    <button type="button" aria-label={`Ubah ${e.name}`} title="Ubah" onClick={() => { setFlash(null); setDialog({ kind: 'employee', employee: e }) }}
                      className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><Pencil className="h-4 w-4" /></button>
                    <button type="button" disabled={busyId === e.id} onClick={() => toggle(e)}
                      aria-label={e.is_active ? `Nonaktifkan ${e.name}` : `Aktifkan ${e.name}`} title={e.is_active ? 'Nonaktifkan' : 'Aktifkan kembali'}
                      className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50">
                      {busyId === e.id ? <LoadingSpinner /> : e.is_active ? <UserMinus className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                    </button>
                    <button type="button" aria-label={`Hapus ${e.name}`} title="Hapus (hanya jika belum pernah digaji)" onClick={() => { setFlash(null); setDialog({ kind: 'delete', employee: e }) }}
                      className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {dialog?.kind === 'employee' && <EmployeeModal businessId={businessId} employee={dialog.employee} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'pay' && <PayModal businessId={businessId} employee={dialog.employee} period={period} periodName={periodName} today={today} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'cancel' && <CancelModal businessId={businessId} payment={dialog.payment} periodName={periodName} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'delete' && <DeleteModal businessId={businessId} employee={dialog.employee} onClose={() => setDialog(null)} onDone={done} />}
    </div>
  )
}

/** Form dalam modal: menjalankan action, menampilkan galat, menutup saat sukses. */
function useSubmit(action: (form: FormData) => Promise<PayrollActionResult>, prepare: (form: FormData) => void, onDone: (r: PayrollActionResult) => void) {
  const [pending, setPending] = useState(false), [error, setError] = useState('')
  async function submit(form: FormData) {
    setPending(true); setError(''); prepare(form)
    try { const result = await action(form); if (result.success) onDone(result); else setError(result.message) }
    catch { setError('Permintaan belum berhasil. Silakan coba kembali.') }
    finally { setPending(false) }
  }
  return { pending, error, submit }
}

function Footer({ pending, onClose, label, pendingLabel, danger = false }: { pending: boolean; onClose: () => void; label: string; pendingLabel: string; danger?: boolean }) {
  return <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
    <button type="button" disabled={pending} onClick={onClose} className={ui.btnSecondary}>Batal</button>
    <button type="submit" disabled={pending} className={danger ? ui.btnDanger : ui.btnPrimary}>{pending && <LoadingSpinner />} {pending ? pendingLabel : label}</button>
  </div>
}

const ErrorText = ({ error }: { error: string }) => error ? <Notice tone="error">{error}</Notice> : null

function EmployeeModal({ businessId, employee, onClose, onDone }: { businessId: string; employee: Employee | null; onClose: () => void; onDone: (r: PayrollActionResult) => void }) {
  const { pending, error, submit } = useSubmit(saveEmployee, form => { form.set('business_id', businessId); form.set('id', employee?.id ?? '') }, onDone)
  return <AdminModal title={employee ? 'Ubah Pegawai' : 'Tambah Pegawai'} description="Gaji pokok dipakai sebagai nominal awal saat mencatat pembayaran." pending={pending} onClose={onClose}>
    <form action={submit} className="space-y-4 p-5">
      <fieldset disabled={pending} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div><label htmlFor="emp-name" className="mb-1 block text-sm font-medium text-gray-700">Nama</label>
            <input id="emp-name" name="name" required maxLength={100} defaultValue={employee?.name ?? ''} className={input} /></div>
          <div><label htmlFor="emp-title" className="mb-1 block text-sm font-medium text-gray-700">Jabatan (opsional)</label>
            <input id="emp-title" name="job_title" maxLength={100} defaultValue={employee?.job_title ?? ''} placeholder="mis. Barista" className={input} /></div>
        </div>
        <div><label htmlFor="emp-salary" className="mb-1 block text-sm font-medium text-gray-700">Gaji pokok per bulan</label>
          <MoneyInput id="emp-salary" name="base_salary" defaultValue={employee ? Number(employee.base_salary) : null} className={input} /></div>
        <div><label htmlFor="emp-note" className="mb-1 block text-sm font-medium text-gray-700">Catatan (opsional)</label>
          <input id="emp-note" name="note" maxLength={500} defaultValue={employee?.note ?? ''} placeholder="mis. nomor rekening, tanggal masuk" className={input} /></div>
      </fieldset>
      <ErrorText error={error} />
      <Footer pending={pending} onClose={onClose} label="Simpan" pendingLabel="Menyimpan..." />
    </form>
  </AdminModal>
}

function PayModal({ businessId, employee, period, periodName, today, onClose, onDone }: {
  businessId: string; employee: Employee; period: string; periodName: string; today: string; onClose: () => void; onDone: (r: PayrollActionResult) => void
}) {
  // Satu identitas per form: klik ganda atau retry tidak mencatat gaji dua kali.
  const [paymentId] = useState(() => crypto.randomUUID())
  const { pending, error, submit } = useSubmit(recordSalary, form => {
    form.set('business_id', businessId); form.set('payment_id', paymentId); form.set('employee_id', employee.id); form.set('period', period)
  }, onDone)
  return <AdminModal title={`Bayar Gaji ${employee.name}`} description={`Periode ${periodName}. Tercatat sebagai pengeluaran bulanan "Gaji Karyawan".`} pending={pending} onClose={onClose}>
    <form action={submit} className="space-y-4 p-5">
      <fieldset disabled={pending} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div><label htmlFor="pay-amount" className="mb-1 block text-sm font-medium text-gray-700">Nominal dibayar</label>
            <MoneyInput id="pay-amount" name="amount" required defaultValue={Number(employee.base_salary) || null} className={input} /></div>
          <div><label htmlFor="pay-date" className="mb-1 block text-sm font-medium text-gray-700">Tanggal bayar</label>
            <input id="pay-date" type="date" name="paid_date" required defaultValue={today} className={input} /></div>
        </div>
        <div><label htmlFor="pay-note" className="mb-1 block text-sm font-medium text-gray-700">Catatan (opsional)</label>
          <input id="pay-note" name="note" maxLength={300} placeholder="mis. transfer BCA, termasuk bonus Rp 100.000" className={input} /></div>
      </fieldset>
      <ErrorText error={error} />
      <Footer pending={pending} onClose={onClose} label="Catat Pembayaran" pendingLabel="Menyimpan..." />
    </form>
  </AdminModal>
}

function CancelModal({ businessId, payment, periodName, onClose, onDone }: { businessId: string; payment: SalaryPayment; periodName: string; onClose: () => void; onDone: (r: PayrollActionResult) => void }) {
  const { pending, error, submit } = useSubmit(cancelSalary, form => { form.set('business_id', businessId); form.set('payment_id', payment.id) }, onDone)
  return <AdminModal title="Batalkan Pembayaran Gaji" description="Gunakan jika nominal atau pegawai salah, lalu catat ulang." pending={pending} onClose={onClose}>
    <form action={submit} className="space-y-4 p-5">
      <p className="text-sm text-gray-700">Batalkan gaji <strong>{payment.employee_name}</strong> periode <strong>{periodName}</strong> sebesar <strong>{rupiah(payment.amount)}</strong>?</p>
      <p className="text-sm text-gray-600">Pengeluaran &quot;Gaji Karyawan&quot; yang terkait ikut dihapus dari daftar dan rekap.</p>
      <ErrorText error={error} />
      <Footer pending={pending} onClose={onClose} label="Batalkan Pembayaran" pendingLabel="Memproses..." danger />
    </form>
  </AdminModal>
}

function DeleteModal({ businessId, employee, onClose, onDone }: { businessId: string; employee: Employee; onClose: () => void; onDone: (r: PayrollActionResult) => void }) {
  const { pending, error, submit } = useSubmit(deleteEmployee, form => { form.set('business_id', businessId); form.set('id', employee.id) }, onDone)
  return <AdminModal title="Hapus Pegawai" description="Hanya untuk pegawai yang belum pernah digaji, misalnya salah input." pending={pending} onClose={onClose}>
    <form action={submit} className="space-y-4 p-5">
      <p className="text-sm text-gray-700">Hapus <strong>{employee.name}</strong> dari daftar pegawai?</p>
      <ErrorText error={error} />
      <Footer pending={pending} onClose={onClose} label="Hapus Pegawai" pendingLabel="Menghapus..." danger />
    </form>
  </AdminModal>
}
