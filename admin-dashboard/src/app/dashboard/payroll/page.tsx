import { ChevronLeft, ChevronRight } from 'lucide-react'
import LoadingLink from '@/components/LoadingLink'
import { Notice, PageHeader, StatCard, ui } from '@/components/ui'
import { EMPTY_BUSINESS_ID, getBusinessContext } from '@/lib/business-context'
import { dayKey, rupiah } from '@/lib/format'
import PayrollClient from './PayrollClient'
import { payrollRows, periodLabel, resolvePeriod, shiftPeriod, summarize, type Employee, type SalaryPayment } from './domain'

export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ m?: string | string[] }> }) {
  const sp = await searchParams
  const { supabase, businessId, businesses } = await getBusinessContext()
  const scoped = businessId ?? EMPTY_BUSINESS_ID
  const today = dayKey(new Date())
  const period = resolvePeriod(sp.m, today)

  const [empRes, payRes] = await Promise.all([
    supabase.from('employees').select('id, name, job_title, base_salary, pay_cycle, is_active, note')
      .eq('business_id', scoped).order('name').limit(1000),
    supabase.from('salary_payments').select('id, employee_id, employee_name, period, amount, paid_date, note, created_by')
      .eq('business_id', scoped).eq('period', period).limit(1000),
  ])
  const employees = (empRes.data ?? []) as Employee[]
  const payments = (payRes.data ?? []) as SalaryPayment[]
  const loadError = empRes.error || payRes.error
    ? 'Gagal memuat data gaji. Pastikan migration terbaru (payroll_salary) sudah dijalankan.'
    : null

  const rows = payrollRows(employees, payments)
  const s = summarize(rows)
  const bizName = businesses.find(b => b.id === businessId)?.name ?? 'Belum ada cabang'
  const href = (p: string) => `/dashboard/payroll?${new URLSearchParams({ m: p })}`

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Usaha & Tim" title="Gaji Pegawai"
        description={<><span className="font-medium text-gray-700">{bizName}</span> · pembayaran gaji otomatis tercatat sebagai pengeluaran bulanan &quot;Gaji Karyawan&quot;.</>}
        actions={
          <nav aria-label="Pilih bulan" className="flex items-center gap-1">
            <LoadingLink href={href(shiftPeriod(period, -1))} aria-label="Bulan sebelumnya" className={ui.btnSecondary + ' px-2.5'}><ChevronLeft className="h-4 w-4" /></LoadingLink>
            <form action="/dashboard/payroll" className="contents">
              <input type="month" name="m" defaultValue={period} aria-label="Bulan gaji" className={ui.inputBare + ' w-auto'} />
              <button type="submit" className={ui.btnSecondary}>Lihat</button>
            </form>
            <LoadingLink href={href(shiftPeriod(period, 1))} aria-label="Bulan berikutnya" className={ui.btnSecondary + ' px-2.5'}><ChevronRight className="h-4 w-4" /></LoadingLink>
          </nav>
        } />

      {loadError && <Notice tone="error">{loadError}</Notice>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={`Sudah dibayar · ${periodLabel(period)}`} value={rupiah(s.paid)} hint={`${s.paidCount} pegawai`} valueClassName="text-emerald-700" />
        <StatCard label="Belum dibayar" value={String(s.unpaidCount)} hint={s.unpaidCount ? `Perkiraan ${rupiah(s.estimate)} dari gaji pokok` : 'Semua pegawai aktif sudah dibayar'} valueClassName={s.unpaidCount ? 'text-amber-700' : 'text-emerald-700'} />
        <StatCard label="Pegawai aktif" value={String(employees.filter(e => e.is_active).length)} hint={`${employees.length} pegawai tercatat`} />
      </div>

      <PayrollClient key={`${businessId ?? 'none'}-${period}`} businessId={businessId ?? ''} period={period}
        periodName={periodLabel(period)} today={today} rows={rows} employees={employees} />
    </div>
  )
}
