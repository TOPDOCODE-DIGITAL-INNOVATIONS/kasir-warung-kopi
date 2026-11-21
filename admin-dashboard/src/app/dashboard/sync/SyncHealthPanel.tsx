import { Activity, AlertTriangle, CheckCircle2, CircleDashed, XCircle } from 'lucide-react'
import { Panel } from '@/components/ui'
import { formatDateTime } from '@/lib/format'
import type { SyncHealth, SyncStatus } from '@/lib/sync-health'

const STATUS: Record<SyncStatus, { label: string; tone: string; Icon: typeof Activity }> = {
  ok: { label: 'Sehat', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100', Icon: CheckCircle2 },
  warning: { label: 'Perlu dicek', tone: 'bg-amber-50 text-amber-700 ring-amber-100', Icon: AlertTriangle },
  error: { label: 'Bermasalah', tone: 'bg-red-50 text-red-700 ring-red-100', Icon: XCircle },
  never: { label: 'Belum ada data', tone: 'bg-gray-100 text-gray-600 ring-gray-200', Icon: CircleDashed },
}

function Stat({ label, value, tone = 'text-gray-900' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3 ring-1 ring-gray-100">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${tone}`}>{value}</p>
    </div>
  )
}

export default function SyncHealthPanel({ health, unavailable }: { health: SyncHealth | null; unavailable?: boolean }) {
  if (unavailable || !health) {
    return (
      <Panel title={<><Activity aria-hidden="true" className="h-4 w-4 text-blue-700" />Kesehatan Sync</>}>
        <p className="text-sm text-gray-500">Riwayat sync belum tersedia. Jalankan migrasi database terbaru untuk mengaktifkan monitoring.</p>
      </Panel>
    )
  }
  const s = STATUS[health.status]
  const { total, failed, avgDurationMs } = health.last24h

  return (
    <Panel
      title={<><Activity aria-hidden="true" className="h-4 w-4 text-blue-700" />Kesehatan Sync</>}
      info="Dihitung dari setiap permintaan kasir ke server selama 7 hari terakhir. Perangkat yang offline baru terlihat saat terhubung lagi."
      actions={<span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${s.tone}`}><s.Icon aria-hidden="true" className="h-3.5 w-3.5" />{s.label}</span>}
    >
      <div className="space-y-5">
        {health.reasons.length > 0 && (
          <ul className="space-y-1.5 rounded-xl bg-amber-50/60 p-3 text-sm text-amber-900 ring-1 ring-amber-100">
            {health.reasons.map((r) => <li key={r} className="flex gap-2"><AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />{r}</li>)}
          </ul>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Sync 24 jam" value={String(total)} />
          <Stat label="Gagal 24 jam" value={String(failed)} tone={failed ? 'text-red-600' : 'text-gray-900'} />
          <Stat label="Rata-rata durasi" value={avgDurationMs === null ? '—' : `${(avgDurationMs / 1000).toFixed(1)} dtk`} />
        </div>

        {health.lastFailure && (
          <div className="text-sm">
            <p className="font-medium text-gray-700">Gagal terakhir · {formatDateTime(health.lastFailure.at)}</p>
            <p className="mt-1 break-words text-gray-500">
              {health.lastFailure.direction === 'push' ? 'Kirim' : 'Tarik'} data · HTTP {health.lastFailure.status}
              {health.lastFailure.error ? ` · ${health.lastFailure.error}` : ''}
            </p>
          </div>
        )}

        {health.devices.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="text-[11px] uppercase tracking-[0.12em] text-gray-500">
                <tr><th className="py-2 pr-3 font-semibold">Perangkat</th><th className="py-2 pr-3 font-semibold">Terakhir terlihat</th><th className="py-2 pr-3 font-semibold">Tertahan</th><th className="py-2 font-semibold">Catatan perangkat</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {health.devices.map((d) => {
                  const pending = (d.pendingTx ?? 0) + (d.pendingExpenses ?? 0)
                  return (
                    <tr key={d.deviceCode}>
                      <td className="py-2.5 pr-3 font-mono text-gray-800">
                        <span aria-hidden="true" className={`mr-2 inline-block h-2 w-2 rounded-full ${d.lastOk ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        {d.deviceCode}
                      </td>
                      <td className="py-2.5 pr-3 text-gray-600">{formatDateTime(d.lastSeenAt)}</td>
                      <td className={`py-2.5 pr-3 tabular-nums ${pending ? 'font-semibold text-red-600' : 'text-gray-500'}`}>
                        {pending ? `${d.pendingTx ?? 0} transaksi · ${d.pendingExpenses ?? 0} pengeluaran` : '—'}
                      </td>
                      <td className="max-w-[16rem] break-words py-2.5 text-gray-500">{d.clientError ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Panel>
  )
}
