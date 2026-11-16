# Pengelolaan Produk & Stok di admin

Dokumen implementasi awal 11 November 2026. **Alur terbaru sejak 12 November dijelaskan pada [Pengeluaran admin dan stok opname](admin-stock-counts.md)**: pembelian melalui Pengeluaran, opname massal, penyesuaian atomik, dan riwayat terpisah. Bagian di bawah merupakan catatan implementasi sebelumnya, termasuk mekanisme penyelesaian pembelian lama yang masih dipertahankan. Pernyataan tanpa migration, pembelian pertama, tombol Tambah Stok, dan operasi multi-request di bawah tidak berlaku untuk alur baru.

## Alur pengguna

- Cabang produk mengikuti **Cabang aktif** di header, sesuai [konteks cabang admin](business-context.md).
- Tab **Semua Produk**, **Produk Jual**, **Produk Beli** memakai `can_sell`/`can_buy`. Barang dapat muncul pada kedua tab.
- **Produk Baru** memakai cabang aktif. Pengguna mengisi nama, SKU opsional, satuan dasar, penanda beli/jual, harga, modal acuan opsional, kategori, deskripsi, ketersediaan, dan stok minimum.
- **Catat jumlah stok** menentukan stok terbatas atau sentinel `-1` yang ditampilkan sebagai `∞`. Resep tidak wajib. Satuan dasar tetap saat edit agar histori tidak berubah.
- Stok awal dapat menjadi saldo awal/manual atau **pembelian pertama** bila barang bisa dibeli.
- Aksi tabel: edit, tambah stok, riwayat, hapus. Hapus mengarsipkan dan mengeluarkan barang dari menu POS, sambil mempertahankan histori dan relasi.

## Pembelian versus penyesuaian

Penambahan dari pembelian membuat `purchases` dan `purchase_lines`. Barang wajib `can_buy=true`; supplier opsional harus milik owner. Satuan pembelian menggunakan `item_units`; penambahan dihitung dalam satuan dasar.

Penambahan manual, saldo awal, atau hasil produksi tidak membuat pembelian fiktif. Jumlah sebelum/sesudah dan alasan dicatat pada `products.raw._inventory.events`. Produksi manual belum otomatis mengurangi bahan resep. Pembelian tidak disalin menjadi `expenses`.

Produk `∞` tetap dapat memiliki riwayat pembelian/penyesuaian, tetapi saldo tetap `-1`. Resep opsional; editor resep, konsumsi bahan otomatis, moving average, ledger terpisah dan HPP aktual tidak dibuat pada perubahan ini. Modal acuan dapat diperbarui dari harga pembelian per satuan dasar; ini bukan moving average.

Pemisahan pembelian, penyesuaian dan produksi juga dipakai [Loyverse Advanced Inventory](https://help.loyverse.com/help/advanced-inventory-management) dan [Production](https://help.loyverse.com/help/how-work-production). Implementasi disederhanakan untuk skema dan kebutuhan internal aplikasi.

## Konsistensi tanpa migration

Server Action memeriksa Auth, kepemilikan produk/cabang, satuan dan supplier. Update produk memakai compare-and-set `updated_at`. Angka divalidasi, dan kalkulasi stok/konversi memakai fixed-point enam desimal (BigInt).

Pencatatan stok/dokumen melibatkan beberapa request, **bukan satu transaksi SQL atomik**:

1. Operasi mendapat UUID tetap selama dialog terbuka, dipakai sebagai ID dokumen/event.
2. Siapkan draft dan rincian pembelian; simpan fingerprint permintaan untuk membedakan retry dengan payload berbeda.
3. Update stok dan event pending sekaligus pada satu baris dengan version check. Bila respons jaringan hilang, periksa event sebelum membersihkan draft.
4. Posting pembelian; trigger existing menghitung/membekukan total.
5. Selesaikan event. Bila posting/finalisasi gagal, **Pembelian tertunda** dan tombol **Selesaikan Pembelian** pada Riwayat melanjutkan operasi tanpa menambah stok lagi.

Jika proses terputus sebelum stok diterapkan, draft dapat tetap ada; retry permintaan yang sama melanjutkannya. Draft tidak masuk total pembelian. Transaksi multi-tabel yang sepenuhnya atomik memerlukan RPC/transaksi database berikutnya. JSON aktivitas adalah catatan aplikasi, bukan ledger terpisah yang tidak dapat diubah.

## Sinkronisasi POS dan backup

Action mengubah hanya entri produk terkait pada `businesses.pos_config`, dengan CAS versi dan retry. Kasir, pengaturan, kategori dan opsi POS lain dipertahankan. Buy-only tidak masuk menu. Cabang yang belum memiliki konfigurasi kasir tidak diberi profil/PIN buatan; data produk jual tersimpan dan konfigurasi dapat dikirim ulang melalui Riwayat setelah kasir terhubung.

Sync perangkat menyaring barang diarsipkan/buy-only agar cache lama tidak memasukkannya kembali. Barang `pos_sync_enabled=false` mempertahankan nilai master server.

API sync tidak mengganti `raw` pada baris existing. Ini melindungi event pertama sekalipun pembuatan jurnal berlomba dengan sync. Opsi POS terbaru tetap berada di `pos_config`, field operasional di kolom typed products. Untuk barang baru, raw diisi dan `_inventory` kiriman perangkat dibuang. Query/penulisan memakai batch, bukan per produk.

Ekspor produk JSON/CSV menyatukan opsi terbaru `pos_config`, field typed dan jurnal tersimpan, memakai konfigurasi yang sudah diambil endpoint backup tanpa query per produk. Ekspor tidak menulis ulang tabel.

## Ringkasan dan histori

- Penjualan: jumlah item/nilai historis `transactions.items.totalPrice` pada completed; cancelled dikecualikan. Bon termasuk penjualan, bukan penerimaan kas.
- Nilai item sebelum diskon/pajak tingkat nota; bukan laba bersih.
- Pembelian: `quantity_base` dan `line_total` dengan header posted; draft/cancelled dikecualikan. Perubahan harga tidak mengubah histori.
- Riwayat menampilkan hingga 50 event dan 50 rincian terakhir. Ringkasan memakai seluruh riwayat paginated.
- Uji 1.003 produk aktif memakai 10 query batch, tanpa N+1 atau batas diam-diam 1.000 baris.

## Validasi

- TypeScript, ESLint, build production, enam tes domain: presisi, validasi, stok tak terbatas, retry jurnal, privasi konfigurasi dan total historis.
- Integrasi Auth/RLS: pembelian pertama, retry, penyesuaian, konflik bersamaan, gagal posting, respons hilang sesudah commit stok, akses lintas tenant, archive dan pengiriman menu.
- Browser Chrome: tab/filter/search, create dengan pembelian pertama, penyesuaian manual, edit harga/stock tracking, riwayat, hapus, keyboard tab. Tidak ditemukan error/warning browser pada pemeriksaan.
- Backup memuat opsi terbaru dan jurnal setelah POS mencoba mengirim `_inventory` sendiri atau barang diarsipkan.

Query/mutasi berada di `admin-dashboard/src/app/dashboard/products/actions.ts`; UI di `ProductsClient.tsx`, helper/types pada folder yang sama. Tambahan lain: endpoint sync/backup, dokumentasi dan tes. Tidak ada deployment remote, migration, ataupun commit otomatis.
