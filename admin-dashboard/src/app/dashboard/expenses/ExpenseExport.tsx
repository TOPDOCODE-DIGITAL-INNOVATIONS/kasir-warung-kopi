'use client'

import { useState } from 'react'
import { FileDown } from 'lucide-react'
import { useDataLoading } from '@/components/DataLoadingContext'
import { printExpenseReport, type ExpenseReport } from '../../../../../shared/expense-report'

export default function ExpenseExport({ report, unavailable = false }: { report: ExpenseReport; unavailable?: boolean }) {
  const [pending, setPending] = useState(false), [error, setError] = useState('')
  const routePending = useDataLoading()
  async function download() {
    setPending(true); setError('')
    try { await printExpenseReport(report) }
    catch { setError('Pratinjau PDF belum berhasil dibuka. Silakan coba kembali.') }
    finally { setPending(false) }
  }
  return <div><button type="button" disabled={pending || routePending || unavailable || !report.rows.length} onClick={download}
    title="Ekspor sesuai filter aktif. Pada dialog cetak, pilih Simpan sebagai PDF."
    className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50">
    <FileDown className="h-4 w-4" />{pending ? 'Menyiapkan PDF...' : 'Ekspor PDF'}
  </button>{error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}</div>
}
