import Link from 'next/link'
import { RefreshCw, Smartphone, Server } from 'lucide-react'
import InfoTip from '@/components/InfoTip'
import { EmptyState, PageHeader, Panel, ui } from '@/components/ui'
import { getBusinessContext, EMPTY_BUSINESS_ID } from '@/lib/business-context'
import { formatDateTime } from '@/lib/format'
import { getSiteUrl } from '@/lib/site-url'

export default async function SyncPage() {
  const { supabase, businessId } = await getBusinessContext()
  const [{ data: businesses }, siteUrl] = await Promise.all([
    supabase.from('businesses').select('id, name, last_synced_at, last_device_code').eq('id', businessId ?? EMPTY_BUSINESS_ID),
    getSiteUrl(),
  ])

  const rows = businesses ?? []
  const steps = [
    <>Buka <Link href="/dashboard/businesses" className="font-semibold text-blue-700 hover:underline">Cabang &amp; Token</Link>, salin token cabang.</>,
    <>Di tablet/HP kasir buka <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">{siteUrl}/kasir/</code> lalu pasang (Add to Home Screen).</>,
    <>Login sebagai Owner di kasir → <strong>Pengaturan</strong> → bagian Sinkronisasi → tempel token → Simpan.</>,
    <>Tekan <strong>Tes Sync Sekarang</strong>. Setelah itu sync berjalan otomatis saat online.</>,
  ]

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Sistem & Akun" title="Status Sinkronisasi" description="Menghubungkan aplikasi kasir offline dengan database." />

      {rows.length === 0
        ? <div className={ui.panel}><EmptyState icon={RefreshCw} title="Belum ada cabang" description="Buat cabang terlebih dahulu untuk menghubungkan aplikasi kasir."
            action={<Link href="/dashboard/businesses" className={ui.btnPrimary}>Buka Cabang &amp; Token</Link>} /></div>
        : rows.map((b) => (
          <section key={b.id} aria-label={`Status sync ${b.name}`} className="relative overflow-hidden rounded-3xl bg-espresso-900 p-6 text-white shadow-lg sm:p-8">
            <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-champagne/15 blur-3xl" />
            <div className="relative grid gap-6 sm:grid-cols-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-champagne">Cabang</p>
                <p className="mt-2 font-display text-2xl font-semibold">{b.name}</p>
              </div>
              <div>
                <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">Sync terakhir <InfoTip tone="dark" label="Sync terakhir" text="Waktu terakhir aplikasi kasir cabang ini berhasil mengirim data ke server." /></p>
                <p className="mt-2 flex items-center gap-2 text-lg font-semibold">
                  <span aria-hidden="true" className={`h-2 w-2 rounded-full ${b.last_synced_at ? 'bg-emerald-400' : 'bg-gray-500'}`} />
                  {b.last_synced_at ? formatDateTime(b.last_synced_at) : 'Belum pernah'}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">Perangkat</p>
                <p className="mt-2 font-mono text-lg">{b.last_device_code ?? '—'}</p>
              </div>
            </div>
          </section>
        ))}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Panel className="lg:col-span-2" title={<><Server aria-hidden="true" className="h-4 w-4 text-blue-700" />Endpoint</>} info="Alamat API yang dipakai aplikasi kasir untuk mengirim data.">
          <div className="break-all rounded-xl bg-gray-50 p-3 font-mono text-sm text-gray-800 ring-1 ring-gray-100">
            POST {siteUrl}/api/sync
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Header <code className="rounded bg-gray-100 px-1 py-0.5">Authorization: Bearer &lt;token cabang&gt;</code>. Data disimpan ke Supabase.
          </p>
        </Panel>

        <Panel className="lg:col-span-3" title={<><Smartphone aria-hidden="true" className="h-4 w-4 text-blue-700" />Cara menghubungkan kasir</>}>
          <ol className="space-y-4">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm text-gray-600">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-espresso-900 text-xs font-semibold text-champagne">{i + 1}</span>
                <span className="pt-1">{step}</span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </div>
  )
}
