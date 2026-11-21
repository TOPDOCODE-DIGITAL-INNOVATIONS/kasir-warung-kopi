import type { Metadata } from 'next'
import LegalPage, { ContactLine } from '@/components/LegalPage'
import { companyInfo, PRODUCT_NAME } from '@/lib/legal'
import { GRACE_DAYS, TRIAL_DAYS } from '../../../../shared/billing-access'

export const metadata: Metadata = { title: `Syarat & Ketentuan · ${PRODUCT_NAME}` }

export default function TermsPage() {
  const c = companyInfo()
  return (
    <LegalPage title="Syarat & Ketentuan">
      <p>Syarat &amp; Ketentuan ini mengatur penggunaan layanan {PRODUCT_NAME} (&quot;Layanan&quot;) yang disediakan oleh {c.name} (&quot;Kami&quot;). Dengan mendaftar atau menggunakan Layanan, Anda (&quot;Owner&quot;) menyetujui ketentuan berikut.</p>

      <h2>1. Layanan</h2>
      <p>{PRODUCT_NAME} adalah aplikasi kasir (point of sale) dan dashboard untuk mencatat transaksi penjualan, modal, pengeluaran, stok, dan laporan usaha pada satu atau lebih cabang. Aplikasi kasir dapat bekerja tanpa koneksi internet dan menyinkronkan data ke server ketika terhubung.</p>

      <h2>2. Akun</h2>
      <ul>
        <li>Owner wajib memberikan data pendaftaran yang benar dan menjaga kerahasiaan password, token sinkronisasi cabang, dan PIN kasir.</li>
        <li>Owner bertanggung jawab atas seluruh aktivitas yang dilakukan melalui akun, cabang, dan perangkat kasirnya, termasuk oleh karyawan yang diberi akses.</li>
        <li>Kami dapat menonaktifkan akun yang digunakan untuk pelanggaran hukum, penipuan, atau penyalahgunaan Layanan.</li>
      </ul>

      <h2>3. Masa coba, langganan, dan pembayaran</h2>
      <ul>
        <li>Akun baru mendapat masa coba gratis {TRIAL_DAYS} hari, satu kali per Owner.</li>
        <li>Setelah masa coba, Layanan memerlukan langganan berbayar (bulanan atau tahunan) dengan harga yang tercantum saat pembayaran. Satu langganan berlaku untuk seluruh cabang milik Owner.</li>
        <li>Pembayaran diproses oleh Xendit sebagai mitra pembayaran. Dengan menyetujui pembayaran, Owner memberi izin penagihan otomatis pada setiap periode sampai perpanjangan dihentikan.</li>
        <li>Owner dapat menghentikan perpanjangan otomatis kapan saja melalui menu Langganan. Akses tetap berlaku sampai akhir periode yang telah dibayar.</li>
        <li>Perubahan harga hanya berlaku untuk pembayaran baru, tidak mengubah periode yang sudah dibayar.</li>
        <li>Biaya yang sudah dibayar tidak dapat dikembalikan, kecuali terjadi tagihan ganda atau kesalahan dari pihak Kami.</li>
      </ul>

      <h2>4. Berakhirnya masa aktif</h2>
      <p>Jika masa coba atau langganan berakhir, Owner mendapat toleransi {GRACE_DAYS} hari dengan fitur penuh. Setelah itu dashboard menjadi hanya-baca (data, laporan, dan backup tetap dapat diakses) dan aplikasi kasir tidak dapat membuat transaksi baru. Transaksi yang sudah tercatat di perangkat tetap dapat disinkronkan. Seluruh fitur aktif kembali setelah pembayaran berhasil.</p>

      <h2>5. Data milik Owner</h2>
      <ul>
        <li>Data usaha yang Owner masukkan tetap menjadi milik Owner. Owner dapat mengunduh backup data kapan saja selama akun aktif.</li>
        <li>Data di perangkat kasir disimpan di browser perangkat sampai tersinkron. Owner wajib memastikan sinkronisasi berjalan rutin dan tidak menghapus data browser sebelum data tersinkron.</li>
        <li>Pemrosesan data pribadi dijelaskan dalam Kebijakan Privasi.</li>
      </ul>

      <h2>6. Penggunaan yang dilarang</h2>
      <ul>
        <li>Menggunakan Layanan untuk kegiatan yang melanggar hukum atau mencatat transaksi fiktif untuk penipuan.</li>
        <li>Mencoba mengakses data Owner lain, mengganggu, atau membebani sistem secara tidak wajar.</li>
        <li>Menyalin, menjual ulang, atau merekayasa balik Layanan tanpa izin tertulis.</li>
      </ul>

      <h2>7. Ketersediaan dan batas tanggung jawab</h2>
      <p>Kami berupaya menjaga Layanan tetap tersedia, tetapi tidak menjamin Layanan bebas gangguan. Laporan di dalam Layanan merupakan alat bantu pencatatan, bukan nasihat keuangan, pajak, atau hukum. Sejauh diizinkan hukum, tanggung jawab Kami atas kerugian yang timbul dari penggunaan Layanan dibatasi sebesar biaya langganan yang dibayar Owner dalam 3 (tiga) bulan terakhir.</p>

      <h2>8. Perubahan ketentuan</h2>
      <p>Kami dapat memperbarui ketentuan ini. Perubahan penting akan diberitahukan melalui dashboard atau email. Penggunaan Layanan setelah perubahan berarti Owner menyetujui ketentuan yang baru.</p>

      <h2>9. Hukum yang berlaku</h2>
      <p>Ketentuan ini tunduk pada hukum Republik Indonesia. Perselisihan diselesaikan secara musyawarah terlebih dahulu.</p>

      <h2>10. Kontak</h2>
      <p>Pertanyaan tentang ketentuan ini dapat disampaikan <ContactLine email={c.email} whatsapp={c.whatsapp} />.</p>
    </LegalPage>
  )
}
