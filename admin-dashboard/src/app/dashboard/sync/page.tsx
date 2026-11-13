import Link from 'next/link'
import { Smartphone, Server } from 'lucide-react'
import { getBusinessContext, EMPTY_BUSINESS_ID } from '@/lib/business-context'
import { formatDateTime } from '@/lib/format'
import { getSiteUrl } from '@/lib/site-url'

export default async function SyncPage() {
  const { supabase, businessId } = await getBusinessContext()
  const [{ data: businesses }, siteUrl] = await Promise.all([
    supabase.from('businesses').select('id, name, last_synced_at, last_device_code').eq('id', businessId ?? EMPTY_BUSINESS_ID),
    getSiteUrl(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Status Sinkronisasi</h1>
        <p className="text-gray-500 text-sm mt-1">Menghubungkan aplikasi kasir offline dengan database.</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-left text-sm text-gray-600">
          <thead className="bg-gray-50 text-xs uppercase text-gray-700">
            <tr>
              <th className="px-4 py-3 font-medium">Cabang</th>
              <th className="px-4 py-3 font-medium">Sync terakhir</th>
              <th className="px-4 py-3 font-medium">Perangkat</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(businesses ?? []).map((b) => (
              <tr key={b.id}>
                <td className="px-4 py-3 font-medium text-gray-900">{b.name}</td>
                <td className="px-4 py-3">{b.last_synced_at ? formatDateTime(b.last_synced_at) : 'Belum pernah'}</td>
                <td className="px-4 py-3 font-mono">{b.last_device_code ?? '-'}</td>
              </tr>
            ))}
            {(!businesses || businesses.length === 0) && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-gray-500">
                  Belum ada cabang.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center mb-4 text-blue-600">
            <Server className="w-7 h-7 mr-3" />
            <h2 className="text-lg font-bold text-gray-900">Endpoint</h2>
          </div>
          <div className="bg-gray-50 p-3 rounded-lg font-mono text-sm border border-gray-200 break-all">
            POST {siteUrl}/api/sync
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Header <code>Authorization: Bearer &lt;token cabang&gt;</code>. Data disimpan ke Supabase.
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center mb-4 text-orange-500">
            <Smartphone className="w-7 h-7 mr-3" />
            <h2 className="text-lg font-bold text-gray-900">Cara menghubungkan kasir</h2>
          </div>
          <ol className="list-decimal list-inside space-y-2 text-gray-600 text-sm">
            <li>
              Buka <Link href="/dashboard/businesses" className="text-blue-600 underline">Cabang & Token</Link>, salin
              token cabang.
            </li>
            <li>
              Di tablet/HP kasir buka <code>{siteUrl}/kasir/</code> lalu pasang (Add to Home Screen).
            </li>
            <li>
              Login sebagai Owner di kasir → <strong>Pengaturan</strong> → bagian Sinkronisasi → tempel token → Simpan.
            </li>
            <li>Tekan <strong>Tes Sync Sekarang</strong>. Setelah itu sync berjalan otomatis saat online.</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
