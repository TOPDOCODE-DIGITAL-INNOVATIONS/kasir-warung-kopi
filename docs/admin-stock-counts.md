# Pengeluaran admin dan stok opname

Tahap admin, 12 November 2026. Migration `20261112070000_admin_expenses_and_stock_counts.sql` menambahkan dua tabel (`stock_adjustments`, `stock_adjustment_lines`), `products.stock_updated_at`, dan metadata opsional pada `expenses`. Tidak ada master produk atau tabel rincian pengeluaran baru. Migration diterapkan ke lokal; remote/production tidak diubah.

## Pengeluaran

Menu Pengeluaran memiliki tombol Tambah Pengeluaran. Satu form berisi 1–100 item, masing-masing memilih produk beli aktif pada cabang atau Lain-lain. Transport/listrik dapat memakai produk referensi tanpa pelacakan stok atau Lain-lain. Tanggal/bulan dan supplier opsional berlaku untuk satu kelompok input; kategori, nominal dan keterangan disimpan per baris. Admin mencatat pengeluaran di luar laci shift; tidak mengubah saldo laci kasir.

Satu item menghasilkan satu baris `expenses`. `entry_group_id` menyatukan satu pengisian; tidak ada baris total tambahan. Jumlah dan satuan wajib untuk produk yang stoknya dilacak. Untuk produk tanpa pelacakan, jumlah boleh kosong. Lain-lain tidak mempunyai jumlah/satuan produk.

Pembelian dengan produk dan jumlah yang diketahui membuat header `purchases` dan `purchase_lines`, terhubung melalui `expenses.purchase_line_id`. Nominal tanpa jumlah tetap masuk `expenses` beserta referensi/snapshot produk, tanpa mengarang jumlah pembelian. Ringkasan pembelian produk menambahkan nominal jenis ini satu kali. Pencatatan ulang produk sama pada satu form ditolak; jumlahnya digabung dalam satu baris. Harga satuan dari total dibulatkan ke atas pada presisi enam desimal, selisih pembulatannya memakai `discount_amount` agar `line_total` tetap tepat sama dengan nominal pengeluaran.

Tidak ada fitur pembayaran/hutang supplier atau status lunas. Status draft/posted pada dokumen pembelian tetap mekanisme internal yang sudah tersedia, diselesaikan dalam transaksi yang sama. Pembuatan produk tidak lagi mencatat pembelian pertama; pembelian melalui Pengeluaran. Pembelian lama yang pending tetap dapat diselesaikan lewat Riwayat tanpa menambah stok lagi.

## Opname dan penyesuaian

Tombol global Stok Opname menampilkan seluruh produk dengan pelacakan aktif pada cabang, terpisah dari tab/pencarian daftar utama. Isian kosong dilewati; angka 0 secara eksplisit berarti habis. Pencarian modal tidak membuang isian produk yang tersembunyi. Setiap produk hanya satu kali per dokumen:

- Isi sisa fisik: stok akhir sama dengan jumlah hasil hitung.
- Pemakaian dan rusak/terbuang: kurangi stok, wajib alasan, tidak boleh negatif.
- Penambahan lainnya: tambah stok tanpa membuat pengeluaran, wajib alasan.

Sebelum penyimpanan, tampilkan ringkasan saldo sebelum/sesudah dan selisih. Stok awal produk baru masih dapat diisi saat membuat produk. Saldo produk lama tidak diedit langsung pada Edit Produk; pengaktifan pelacakan dimulai dari 0, dilanjutkan melalui opname. Perubahan setting pelacakan tetap dicatat pada jurnal lama.

Menu aksi produk memakai popover native: Edit Produk, Kelola Stok, Riwayat, Hapus. Kelola Stok membuka form penyesuaian untuk produk tersebut. Kolom Cabang tidak ditampilkan karena mengikuti cabang aktif. Stok tidak dilacak ditampilkan sebagai teks; angka `-1` tetap dipertahankan untuk kompatibilitas format POS. Update stok menampilkan waktu perubahan saldo atau konfirmasi opname, bukan waktu edit nama/harga. Data lama tanpa waktu stok yang dapat dipastikan ditampilkan `—`.

Riwayat Produk menggabungkan akses dokumen opname/penyesuaian baru, jurnal lama, dan dokumen pembelian. Tampilan dibatasi 100 penyesuaian, 50 event lama dan 50 rincian pembelian terbaru; backup memuat keseluruhan data. Backup JSON/CSV ditambah pilihan pembelian, rincian pembelian, dokumen opname dan rinciannya.

## Konsistensi dan akses

Server Actions berada bersama halaman masing-masing dan selalu memeriksa cabang aktif. Dua RPC `admin_record_expenses` dan `admin_record_stock` menjalankan seluruh operasi dalam satu transaksi PostgreSQL. RPC memeriksa `auth.uid()` dan kepemilikan cabang, mengunci baris produk dengan urutan UUID yang konsisten, memeriksa versi `updated_at`, dan memvalidasi satuan/kuantitas. API dapat menerima beberapa ratus baris, tetapi tidak melakukan request per item. Data pilihan dibaca bertahap 500 baris.

UUID operasi dipertahankan selama modal dibuka. Payload pertama disimpan untuk memverifikasi retry: pengiriman ulang yang sama tidak menggandakan biaya atau stok; payload berbeda dengan UUID sama ditolak. Kegagalan satu item membatalkan seluruh kelompok. Dokumen penyesuaian hanya dapat dibaca owner melalui RLS; insert terjadi melalui RPC. Dokumen tidak dapat dihapus/diedit oleh client biasa.

`supabase/tests/admin_inventory.sql` menguji transaksi, otorisasi, retry, versi lama, jumlah nol/kosong, nominal pembelian, dan timestamp. Seluruh fixture di-rollback.

## Batas tahap ini

API `/api/sync`, aplikasi kasir, resep dan pemotongan stok oleh POS **tidak diubah**. Produk yang masih mengizinkan stok dari POS dapat berubah lagi setelah sync; saldo admin belum dilindungi dari perilaku itu atas permintaan pengguna. Pengeluaran baru dapat ditarik melalui format pengeluaran POS lama, tetapi UI kasir belum memahami metadata barang, kelompok, atau hubungan ke dokumen pembelian. Menghapus pengeluaran melalui kasir lama belum membalikkan stok/pembelian. Perubahan tersebut merupakan tahap integrasi kasir berikutnya.

Tidak ada jadwal opname otomatis, konsumsi resep otomatis, perhitungan HPP aktual, atau perubahan saldo produk lama ketika migration dijalankan.
