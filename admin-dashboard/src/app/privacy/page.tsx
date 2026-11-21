import type { Metadata } from 'next'
import LegalPage, { ContactLine } from '@/components/LegalPage'
import { companyInfo, PRODUCT_NAME } from '@/lib/legal'

export const metadata: Metadata = { title: `Kebijakan Privasi · ${PRODUCT_NAME}` }

export default function PrivacyPage() {
  const c = companyInfo()
  return (
    <LegalPage title="Kebijakan Privasi">
      <p>Kebijakan ini menjelaskan bagaimana {c.name} (&quot;Kami&quot;) memproses data pribadi dalam layanan {PRODUCT_NAME}, sesuai Undang-Undang No. 27 Tahun 2022 tentang Pelindungan Data Pribadi.</p>

      <h2>1. Data yang Kami kumpulkan</h2>
      <ul>
        <li><strong>Akun Owner:</strong> nama, email, dan password (tersimpan dalam bentuk terenkripsi/hash). Jika masuk dengan Google, Kami menerima nama dan email dari akun Google Anda.</li>
        <li><strong>Data usaha:</strong> nama dan alamat cabang, produk, harga, stok, supplier, transaksi, pengeluaran, modal, shift, serta nama dan PIN profil kasir (PIN disimpan sebagai hash).</li>
        <li><strong>Data pelanggan toko:</strong> nama atau nomor telepon pelanggan yang dimasukkan kasir secara opsional, mis. untuk bon/hutang.</li>
        <li><strong>Data pembayaran langganan:</strong> status dan riwayat tagihan dari Xendit. Kami tidak menyimpan nomor kartu atau CVV.</li>
        <li><strong>Data teknis:</strong> kode perangkat kasir, waktu sinkronisasi, dan log server untuk keamanan dan pemecahan masalah.</li>
      </ul>

      <h2>2. Tujuan penggunaan</h2>
      <ul>
        <li>Menyediakan fitur kasir, sinkronisasi, laporan, dan backup.</li>
        <li>Mengelola masa coba, langganan, dan penagihan.</li>
        <li>Mengirim email layanan seperti konfirmasi akun, reset password, dan pemberitahuan tagihan.</li>
        <li>Menjaga keamanan dan mencegah penyalahgunaan.</li>
      </ul>
      <p>Kami tidak menjual data Anda dan tidak memakai data usaha Anda untuk iklan.</p>

      <h2>3. Pihak ketiga yang memproses data</h2>
      <ul>
        <li><strong>Supabase</strong> untuk database dan autentikasi.</li>
        <li><strong>Vercel</strong> untuk hosting aplikasi.</li>
        <li><strong>Xendit</strong> untuk pemrosesan pembayaran langganan.</li>
        <li><strong>Google</strong> bila Anda memilih masuk dengan Google.</li>
      </ul>
      <p>Penyedia tersebut dapat menyimpan data di luar Indonesia dengan standar pelindungan yang setara.</p>

      <h2>4. Penyimpanan dan keamanan</h2>
      <p>Data dikirim melalui koneksi terenkripsi (HTTPS). Akses data dibatasi per Owner dan per cabang. Data di perangkat kasir tersimpan di browser perangkat dan otomatis dibersihkan setelah tersinkron dan berumur lebih dari 62 hari. Data akun dan usaha disimpan selama akun aktif. Setelah permintaan penghapusan, data dihapus dalam waktu wajar kecuali harus disimpan karena kewajiban hukum.</p>

      <h2>5. Hak Anda</h2>
      <ul>
        <li>Mengakses dan mengunduh data usaha melalui fitur Backup.</li>
        <li>Memperbaiki data akun dan data usaha.</li>
        <li>Meminta penghapusan akun beserta data usaha.</li>
        <li>Menarik persetujuan pemrosesan data, dengan konsekuensi Layanan tidak dapat digunakan.</li>
      </ul>
      <p>Sebagai Owner, Anda adalah pengendali data untuk data pelanggan toko yang Anda masukkan. Kami memprosesnya hanya untuk menyediakan Layanan bagi Anda.</p>

      <h2>6. Cookie</h2>
      <p>Kami hanya memakai cookie yang diperlukan untuk login dan menyimpan pilihan cabang aktif. Kami tidak memakai cookie pelacakan iklan.</p>

      <h2>7. Kontak</h2>
      <p>Permintaan terkait data pribadi dapat disampaikan <ContactLine email={c.email} whatsapp={c.whatsapp} />.</p>
    </LegalPage>
  )
}
