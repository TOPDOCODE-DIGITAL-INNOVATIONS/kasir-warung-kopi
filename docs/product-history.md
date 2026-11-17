# Riwayat produk — 17 November 2026

Modal Produk & Stok memakai tiga tab: Dokumen Pembelian (default), Opname &
Penyesuaian Stok, serta Aktivitas Stok & Produk. Dialog lebih lebar pada desktop;
daftar tiap tab dapat di-scroll dan ditampilkan 20 catatan per tahap.

## Filter dan harga

- Default satu bulan berjalan terakhir, termasuk hari ini. Batas maksimal tiga
  bulan kalender, mengikuti validasi Overview. Tanggal memakai WIB. Rentang
  sehari tetap diperbolehkan; tanggal wajib diisi.
- Tanggal diterapkan melalui tombol Terapkan. Ringkasan penjualan/pembelian di
  atas tetap seluruh riwayat, dengan label eksplisit. Isi tab mengikuti tanggal.
- Dokumen Pembelian bisa diurutkan terbaru atau harga per satuan dasar termurah.
  Harga = `purchase_lines.line_total / quantity_base`, termasuk diskon baris.
  Konversi memakai snapshot dokumen, bukan konversi kemasan saat ini.
- Pilihan Supplier Berbeda mengambil satu pembelian termurah per `supplier_id`
  dalam rentang terpilih. Harga yang sama memilih pembelian lebih baru, lalu ID
  sebagai pemecah seri. Nama supplier tidak dipakai sebagai identitas.
- Pembelian tanpa supplier tetap catatan tersendiri. Jika seluruh pembelian suatu
  supplier tidak memiliki jumlah, wakilnya adalah catatan terbaru, tanpa harga
  per satuan. Catatan tanpa jumlah ditempatkan setelah harga yang diketahui.

## Sumber dan batas pengambilan

- Pembelian tercatat: `purchase_lines` join `purchases` berstatus `posted`;
  filter tanggal menggunakan `purchases.purchased_at`.
- Pengeluaran produk tanpa dokumen pembelian: `expenses` dengan `product_id`
  yang sama dan `purchase_line_id IS NULL`. Pengeluaran terhubung tidak diambil
  lagi, sehingga tidak terhitung ganda. Catatan tanpa produk tidak bisa ditebak
  menjadi pembelian produk tertentu.
- Pengeluaran tanpa jumlah tetap tampil dengan nominal, tanggal, catatan dan
  supplier opsional. Tidak ada harga per satuan yang ditebak. Baris pengeluaran
  lama tanpa dokumen konversi juga tidak dihitung memakai konversi saat ini.
- Pengeluaran bulanan memakai tanggal 1 sebagai jangkar, sama seperti Rekap
  Keuangan. Waktu pengeluaran harian tidak ditampilkan karena hanya tanggalnya
  yang tercatat.
- Nama supplier memakai snapshot pembelian/pengeluaran; alamat memakai master
  `suppliers.address` saat ini dan diberi label demikian. Join alamat dalam query
  yang sama, tanpa query per baris/supplier. Tidak ada snapshot alamat baru.
- Hanya tab aktif yang dimuat; query memeriksa login, owner, dan cabang aktif.
  Pembelian/pengeluaran/opname disaring di database dan dipaginasi 500 baris.
  Maksimal 1.000 baris per sumber untuk satu rentang. Jika terlampaui, tampilkan
  pesan mempersempit tanggal; tidak merangking hasil terpotong sebagai termurah.
- Aktivitas lama masih berasal dari JSON satu produk (`raw._inventory.events`).
  Hanya tab Aktivitas yang membaca JSON tersebut, lalu menyaring tanggal di
  server. Format penyimpanan lama belum dipaginasi oleh database. Respons juga
  dibatasi 1.000 aktivitas dalam rentang terpilih.
- Browser menyimpan maksimal tiga hasil tab/rentang selama modal terbuka.
  Pengurutan, pengelompokan supplier, dan Muat Lebih Banyak tidak memicu fetch.
  Hasil dimuat ulang setelah aksi penyelesaian pembelian/kirim ulang ke kasir.

Tidak ada perubahan migration, harga acuan, atau data production. Form Produk
Baru tetap mengikuti [form produk](product-form.md).
