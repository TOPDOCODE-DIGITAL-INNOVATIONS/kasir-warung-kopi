import { RefreshCw, Smartphone, Server } from 'lucide-react'

export default function SyncPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Status Sinkronisasi</h1>
        <p className="text-gray-500 text-sm mt-1">Panduan menghubungkan aplikasi Kasir Offline (HP) dengan Server.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center mb-4 text-blue-600">
            <Server className="w-8 h-8 mr-3" />
            <h2 className="text-lg font-bold text-gray-900">API Server Status</h2>
          </div>
          <p className="text-gray-600 mb-4">Endpoint sinkronisasi saat ini aktif dan siap menerima data.</p>
          
          <div className="bg-gray-50 p-4 rounded-lg font-mono text-sm border border-gray-200 break-all">
            POST /api/sync
          </div>
          <p className="text-xs text-gray-500 mt-2">Dibutuhkan Authorization Header dengan Bearer Token pengguna.</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center mb-4 text-orange-500">
            <Smartphone className="w-8 h-8 mr-3" />
            <h2 className="text-lg font-bold text-gray-900">Cara Sinkronisasi Kasir</h2>
          </div>
          <ol className="list-decimal list-inside space-y-3 text-gray-600 text-sm">
            <li>Pastikan aplikasi Kasir (Mobile) sudah terinstall.</li>
            <li>Login pada aplikasi Kasir menggunakan akun Owner atau Kasir.</li>
            <li>Lakukan transaksi secara offline seperti biasa.</li>
            <li>Saat terhubung ke internet, masuk ke menu <strong>Sinkronisasi</strong> di aplikasi kasir.</li>
            <li>Tekan tombol <strong>Mulai Sinkronisasi</strong>.</li>
            <li>Data riwayat transaksi akan secara otomatis masuk ke halaman Riwayat Transaksi di dashboard ini.</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
