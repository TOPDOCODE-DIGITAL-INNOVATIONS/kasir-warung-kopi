# Indikator proses admin

- Loading halaman pertama tetap memakai `dashboard/loading.tsx` yang sudah tersedia.
- `DataLoadingProvider` membagikan status transisi berdasarkan halaman dan kontrol pemicunya. `DataPanel` menempatkan spinner di tengah tabel atau card/panel yang memuat data; ukuran dan konten sebelumnya tetap dipertahankan. Tidak ada overlay pada seluruh halaman.
- Filter tanggal/cabang overview dan transaksi memakai `FilterForm` dengan navigasi client. Card, grafik, dan tabel di halaman terkait mengikuti transisi tersebut. Validasi tanggal overview tetap berjalan sebelum navigasi.
- Pilihan periode, tautan filter, dan cabang header mengaktifkan loading pada panel data halaman terkait. Kontrol pemicu tetap dipisahkan agar filter biasa tidak menampilkan status seolah cabang sedang diganti.
- `usePendingRefresh` mengikuti transisi `router.refresh()`. Produk, Kelola User, transaksi, pengeluaran, rekap, data lama, dan daftar cabang/aturan menggunakan indikator di dalam area data.
- Tombol tanpa ikon, seperti Terapkan, Simpan dan Hapus di modal, tetap memiliki spinner. Tombol berikon pada daftar mempertahankan ikonnya; feedback utama ditempatkan di tabel/panel. Ekspor PDF tetap menampilkan teks proses pada tombol.
- Riwayat produk, tabel stok opname, dan pilihan produk pengeluaran menampilkan status di area pemuatan masing-masing.
- Spinner berhenti mengikuti penyelesaian request/transisi. Kesalahan tetap memakai pesan error yang sudah ada. Tidak ada penundaan buatan, perubahan query database, dependency, atau migration.
- Indikator pergantian cabang header dan unduhan backup yang sudah tersedia tetap dipakai. Kasir memakai data lokal dan indikator sinkronisasi yang sudah ada.
