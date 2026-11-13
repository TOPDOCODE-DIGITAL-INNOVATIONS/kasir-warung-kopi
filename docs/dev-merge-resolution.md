# Integrasi ngr dan main ke dev — 12 November 2026

Dasar perbaikan: `dev` pada `daa1348`, dengan parent `94b2ec1` (PR ngr sampai `0b68127`) dan `a96e231` (main). Desain header/sidebar dari `f375db7` juga disatukan dengan menu Rekap Keuangan yang berasal dari main.

## Keputusan integrasi

- Transaksi memakai satu komponen: filter tanggal, status, pembayaran, pencarian, detail nota dan riwayat koreksi tetap tersedia. Query selalu dibatasi cabang aktif; parameter URL cabang lama tidak mengubah konteks.
- Pengeluaran dan Rekap Keuangan mempertahankan filter periode, kategori dan rincian dari main. Data transaksi, pengeluaran, rekap manual, aturan buku dan pilihan periode mengikuti cabang aktif.
- Overview tetap memiliki filter cabang independen. Tanpa filter, ringkasan dan transaksi terbaru mencakup semua cabang yang dapat diakses owner. Tautan daftar transaksi diberi label cabang aktif supaya sesuai dengan konteks halaman tujuan.
- Sidebar/header baru tetap memuat Rekap Keuangan, Kelola User, Backup dan seluruh menu sebelumnya. Nama/email/Owner dan Keluar berada dalam menu akun. Tampilan cetak menyembunyikan navigasi/header dan membebaskan tinggi area laporan agar laporan panjang tidak terpotong.
- Sync mempertahankan draf dan koreksi transaksi dari main, bersama rekonsiliasi produk, stok pecahan, proteksi barang arsip/buy-only dan jurnal inventory dari ngr. Variabel konfigurasi dapat diperbarui oleh rekonsiliasi.
- Koreksi yang membawa edit_history tidak boleh dilaporkan berhasil bila kolom audit belum tersedia. Kasir mendapat error migration dan tetap dapat mengirim ulang koreksinya setelah struktur diperbarui.

## Database

Migration tambahan `20261112050000_sync_drafts_and_transaction_edits.sql` menambahkan `transactions.edit_history`, tabel `draft_orders`, index serta grant/RLS. Draf dapat diakses oleh POS menggunakan publishable key dan token cabang, serta dibaca oleh owner sesuai kepemilikan cabang. Identitas produk, jurnal stok dan snapshot transaksi sebelumnya dipertahankan.

Gunakan alur migration untuk pembaruan lingkungan; jangan menjalankan ulang seluruh `schema.sql` sebagai pengganti migration inventory. Pada CLI v3 yang dipakai proyek ini, `npx supabase migration up` menarget stack lokal secara default. Pembaruan project hosted mengikuti proses deployment tersendiri.

Pada pengerjaan ini migration hanya diterapkan ke Supabase lokal. Backup sebelumnya disimpan dalam folder `backups/dev-merge-fix-*` yang diabaikan Git. Tidak ada perubahan database remote.

## Validasi

- TypeScript dan build admin serta aplikasi kasir.
- Tes gabungan endpoint sync: konfigurasi kasir, draf, riwayat koreksi, jurnal inventory, barang arsip/buy-only dan harga/stok yang dilindungi admin.
- Tes halaman dengan dua cabang dan akun tanpa cabang; URL tidak dapat mengganti konteks transaksi/pengeluaran/rekap. Filter transaksi dan pengecualian Overview dipertahankan.
- Seluruh migration diuji dari database kosong. Migration tambahan diuji dua kali dan dibandingkan terhadap produk/transaksi lama.
- Tes SQL RLS draf mencakup token valid, token cabang lain, permintaan anonim tanpa token, pembacaan owner dan penghapusan draf. Fixture di-rollback.
- Tes SQL inventory sebelumnya serta pengujian HTTP nyata pada aplikasi lokal. Akun/cabang HTTP sementara dibersihkan.
- Checksum data pada 16 tabel lama serta keempat file konfigurasi lokal diperiksa sebelum/sesudah.
