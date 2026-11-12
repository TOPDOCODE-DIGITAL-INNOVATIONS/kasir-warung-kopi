# Model data inventory, HPP, dan laba

Tanggal riset: 10 November 2026. Struktur aktual disederhanakan pada 11 November 2026.

## Struktur aktual: produk dan pengaturannya berada pada products

**Gunakan satu tabel existing: public.products.** Identitas, cabang, harga jual, modal, stok dan pengaturan inventory berada pada baris produk yang sama. Tabel product, catalog_items, branch_items dan branch_product tidak ada pada struktur akhir. Tidak ada sinkronisasi antar-tabel master/pengaturan produk.

Migration terbaru: [20261111080000_merge_branch_product_into_products.sql](../supabase/migrations/20261111080000_merge_branch_product_into_products.sql). Migration sebelumnya tetap menjadi riwayat, bukan acuan struktur akhir. Urutannya baseline, inventory_foundation, rename_branch_product, use_existing_products_for_inventory, lalu merge_branch_product_into_products. Semuanya sudah diterapkan pada Supabase **lokal**; remote development dan production belum diperbarui.

| Tabel | Fungsi aktual |
| --- | --- |
| products — existing, diperluas | Barang per cabang, identitas, satuan dasar, penanda beli/jual, harga, modal, stok dan pengaturan inventory. |
| units | Daftar satuan dan dimensi/faktor referensi. |
| item_units | Konversi satuan atau kemasan spesifik produk. |
| suppliers | Pemasok milik owner. |
| product_suppliers | Relasi many-to-many produk–supplier, kemasan, harga referensi dan kode supplier. |
| recipes | Header dan versi resep opsional untuk produk pada cabangnya. |
| recipe_lines | Bahan, jumlah dan snapshot konversi resep. |
| purchases | Header dokumen pembelian per cabang. |
| purchase_lines | Detail barang, jumlah, harga, diskon/pajak dan snapshot pembelian. |

Hasilnya **products existing diperluas + delapan tabel pendukung baru**, atau 16 tabel public bersama tujuh tabel lama lainnya. Units/item_units, supplier/product_suppliers, dan header/rincian resep/pembelian mempunyai fungsi berbeda.

### Identitas produk dan cabang

- Primary key products(business_id,id) dan ID teks POS lama tetap dipertahankan. Setiap produk merupakan milik satu cabang. Produk yang sama pada cabang berbeda mempunyai baris tersendiri, sesuai model kasir existing. Nama atau ID sama tidak otomatis menggabungkan barang.
- Inventory_id adalah UUID internal unik di baris products yang sama, dipakai oleh FK product_id pada item_units, product_suppliers, recipes dan purchase_lines. Component_product_id pada recipe_lines merujuk ke UUID produk bahan. Snapshot transaksi lama tetap memakai ID produk POS yang asli.
- Owner diturunkan dari businesses.owner_id. Owner, business_id, id, inventory_id dan satuan dasar tidak dapat diganti melalui UPDATE. SKU unik per cabang, sehingga cabang berbeda dapat memakai SKU yang sama.
- FK gabungan (business_id,inventory_id,owner_id) memastikan produk hasil resep, bahan dan pembelian berasal dari cabang dan owner dokumen tersebut. Produk dari cabang lain ditolak meskipun owner sama.
- Harga, modal, stok, kuantitas dan faktor memakai numeric; products.price, cost_price dan stock memakai numeric(18,6). Nilai existing tidak berubah ketika presisi ditingkatkan. Stok -1 tetap sentinel tidak terbatas pada POS; belum merupakan saldo ledger inventory yang terverifikasi.

### Kolom pengaturan yang digabung

| Kolom products | Isi |
| --- | --- |
| price | Harga jual, satu sumber pada tabel produk. |
| cost_price | Modal manual; NULL berarti belum diketahui. |
| stock | Jumlah stok POS, mendukung pecahan. |
| is_available, is_active | Ketersediaan dan status aktif barang cabang. |
| cost_source | manual / recipe / inventory. |
| stock_mode | none / self / recipe. |
| min_stock | Batas minimum stok; angka negatif/NaN ditolak. |
| pos_managed | Produk berasal/dikelola dari POS; dipakai untuk menyaring pembaruan daftar menu. |
| pos_sync_enabled | Apakah penulisan memakai token POS boleh memperbarui produk tersebut. Pengganti kontrol legacy_sync_enabled yang semula ada pada pengaturan cabang. |

Kolom tambahan master tetap meliputi sku, description, base_unit_id, can_buy, can_sell, created_at dan updated_at. Opsi/kategori/detail payload POS berada pada raw. Harga dan modal bertingkat di raw atau snapshot transaksi merupakan payload/snapshot; sumber kolom operasional adalah price dan cost_price pada products.

### Sinkronisasi kasir ke admin

Format payload kasir dan primary key lama tidak diubah. API tetap batch-upsert langsung ke products berdasarkan (business_id,id). Tidak ada request tambahan per produk. Trigger batch hanya melengkapi konversi satuan dasar untuk produk POS, tanpa menyalin harga/modal ke tabel lain.

Token POS dapat menulis kolom POS lama, tetapi column grants mencegah perubahan langsung ke owner, inventory UUID, satuan, SKU, penanda pembelian, cost_source, min_stock dan kontrol sync. Produk baru yang masuk melalui token POS ditandai pos_managed=true. Stock_mode awalnya none bila stock<0, self jika stok terbatas; mode recipe yang sudah dipilih tidak ditimpa oleh pembaruan stok POS.

Pos_sync_enabled=false membuat token POS tidak dapat menimpa nilai produk yang dikelola admin/inventory. Perubahan dari owner melalui client admin normal tetap diperbolehkan. Flag ini berbeda dengan pos_managed yang menandai asal pengelolaan produk.

Produk yang hilang dari daftar menu ditandai tidak tersedia, dengan filter pos_managed=true dan pos_sync_enabled=true. Daftar kosong juga diproses. Bahan buy-only dan produk yang mematikan sync tidak ikut dibersihkan. Baris yang mempunyai relasi inventory tidak dihapus fisik oleh pembersihan sync.

Pos_config tetap merupakan konfigurasi/cache bersama menu, kategori, kasir dan pengaturan untuk perangkat; bukan tabel master inventory kedua. Pengelolaan produk dasar di admin dan pengiriman perubahan ke menu POS kini tersedia; lihat [Pengelolaan Produk & Stok](product-management.md). Editor resep dan konsumsi bahan otomatis tetap pekerjaan berikutnya. Tidak diperlukan perubahan format transaksi atau ID perangkat pada penggabungan ini.

### Resep dan pembelian

Recipes.product_id sekarang langsung merujuk ke products.inventory_id pada cabang yang sama. Pada migration, UUID pengaturan lama pada header resep dikonversi ke UUID produk tanpa mengganti versi, timestamp dan snapshot resep terbit. Header/rincian pembelian dan bahan resep langsung ber-FK ke products; tidak ada relasi ke branch_product lagi.

Header dibuat draft sebelum rincian. Faktor, nama dan satuan disalin menjadi snapshot oleh database. Base unit tetap, kg ke g harus 1000, massa ke volume ditolak, dan kemasan boleh memiliki faktor khusus barang. Harga/jumlah/faktor menolak NaN.

Resep aktif wajib berisi bahan dan tidak boleh merujuk diri atau membentuk siklus. Maksimal satu resep aktif per produk. Resep terbit dan rincian terkunci; arsipkan lalu buat versi baru. Header lock dan advisory lock owner mengurutkan perubahan/penerbitan.

Posting pembelian draft menjadi posted menghitung subtotal dan pajak dari rincian serta total setelah diskon dokumen/biaya tambahan. Barang harus bisa dibeli. Posted tidak dapat diubah/dihapus; pembatalan memerlukan alasan dan mempertahankan nilai/snapshot. Nomor dokumen unik per cabang.

Posting dokumen belum menggerakkan ledger stok, moving average, HPP aktual, pembayaran hutang supplier, alokasi laba atau PPh. Cost_source dan stock_mode menyiapkan fondasi; pemilihan mode berbasis resep perlu validasi resep aktif pada aplikasi inventory berikutnya. Jangan mencatat total pembelian otomatis sebagai expenses sekaligus HPP.

### Penerapan dan verifikasi

Migration penggabungan atomik dengan transaksi dan table lock. Bila ada relasi produk lintas cabang atau harga/modal/stok/status bertentangan pada tabel lama, migration berhenti agar data tidak dipilih/ditimpa diam-diam. Pengecekan data lokal menemukan nol konflik pada 77 pemetaan, sehingga seluruh pengaturan berhasil digabung.

- 51 pemeriksaan SQL lulus pada dry-run rollback, instalasi kosong, hasil restore backup, dan database lokal setelah penerapan, mencakup owner/cabang, resep, pembelian, konversi dan sync.
- Uji migration juga memakai resep active dan pembelian posted yang dibuat sebelum merge. Pengalihan FK mempertahankan versi, timestamp, snapshot bahan, serta nilai dan rincian pembelian.
- Semua kolom lama pada products dan dataset lama tetap sama. 77 pengaturan dipindah; cost_source, stock_mode, min_stock dan kontrol sync dibandingkan satu per satu dengan salinan sebelum merge.
- Fajar tetap memiliki 39 produk sesuai ID backup dan 65 transaksi (62 backup + 3 contoh lama). Tidak ada produk Fajar dengan ID di luar backup. Penggabungan tidak menghapus akun atau data cabang lain.
- Pengujian HTTP memeriksa payload POS existing, harga pada satu tabel, UUID stabil, stok/modal pecahan, opt-out sync, daftar kosong, bahan buy-only, dan fallback publishable key + token sync. Akun/cabang uji sementara dibersihkan.
- CSV produk memasukkan kolom inventory yang digabung. JSON mengambil seluruh kolom products.
- Backup sebelum merge: backups/merge-branch-products-20261111/before-merge.dump beserta before-data.json. Folder diabaikan Git. Dump mencakup public/auth/inventory_private tanpa owner/ACL; restore mengembalikan izin aplikasi sesuai migration. Setting internal Auth mengikuti instalasi Supabase tujuan.

Jalankan lokal dengan npx supabase migration up, tanpa db reset. Untuk deployment remote nanti: backup dan uji restore, periksa target serta riwayat baseline, tinjau npx supabase db push --dry-run, lalu lakukan deployment tersendiri. Sertakan data perangkat yang belum sync dan objek Storage bila digunakan. Tidak ada deployment remote atau commit otomatis pada pekerjaan ini.

Regression test: [inventory_foundation.sql](../supabase/tests/inventory_foundation.sql), jalankan melalui psql dengan ON_ERROR_STOP=1. Semua fixture di-rollback; file ini bukan format pgTAP.

Rujukan teknis: [migration Supabase](https://supabase.com/docs/guides/local-development/database-migrations), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [constraint PostgreSQL](https://www.postgresql.org/docs/17/sql-createtable.html).

## Riset dan usulan awal (arsip)

Bagian di bawah mempertahankan pertimbangan riset awal dan fase yang pernah diusulkan. **Cakupan aktual adalah products existing beserta delapan tabel pendukung pada bagian implementasi di atas**; nama/kolom usulan pada bagian arsip bukan acuan migration yang sudah dibuat.

Tujuan: mendukung barang yang dibeli, barang yang dijual, resep opsional, biaya per porsi, dan laporan laba setelah biaya/pajak. Nama tabel di bawah adalah usulan, bukan struktur yang sudah tersedia.

### Usulan awal tahap pertama yang disederhanakan

Tahap pertama memakai **3 tabel baru** untuk master barang beli/jual, satuan, dan pengaturan per cabang. Rancangan lengkap pada bagian selanjutnya menjadi referensi pengembangan bertahap.

| Tabel | Fungsi tahap pertama |
| --- | --- |
| `units` | Daftar satuan seperti pcs, g, kg, ml, dan liter. |
| `catalog_items` | Identitas barang milik owner, dipakai bersama oleh cabangnya. Penanda beli dan jual dapat sama-sama aktif. |
| `branch_product` | Barang yang digunakan pada cabang beserta harga jual, modal manual, dan status ketersediaannya. |

Struktur minimal `units`:

| Kolom | Tipe / aturan | Isi |
| --- | --- | --- |
| `id` | UUID, primary key | Identitas satuan. |
| `code` | Text, unique | Kode seperti pcs, g, kg, ml, l. |
| `name` | Text | Nama satuan yang ditampilkan. |
| `dimension` | Text | count, mass, atau volume. |
| `allows_fraction` | Boolean | Apakah jumlah dapat memakai pecahan. |

Daftar satuan dapat diisi melalui seed. Form barang cukup menyediakan dropdown satuan.

Struktur minimal `catalog_items`:

| Kolom | Tipe / aturan | Isi |
| --- | --- | --- |
| `id` | UUID, primary key | Identitas barang. |
| `owner_id` | UUID, foreign key | Pemilik katalog sesuai model owner aplikasi sekarang. |
| `sku` | Text, nullable | Kode barang, unik per owner jika diisi. |
| `name` | Text | Nama barang. |
| `description` | Text, nullable | Keterangan barang. |
| `base_unit_id` | UUID, foreign key ke `units` | Satuan yang dipakai untuk harga dan modal tahap pertama. |
| `can_buy` | Boolean | Barang dapat dipilih sebagai barang beli. |
| `can_sell` | Boolean | Barang dapat ditampilkan sebagai barang jual. |
| `is_active` | Boolean | Status aktif / arsip barang. |
| `created_at`, `updated_at` | Timestamptz | Waktu pencatatan dan perubahan. |

Struktur minimal `branch_product`:

| Kolom | Tipe / aturan | Isi |
| --- | --- | --- |
| `id` | UUID, primary key | Identitas pengaturan barang cabang. |
| `business_id` | UUID, foreign key ke `businesses` | Cabang yang memakai barang. |
| `item_id` | UUID, foreign key ke `catalog_items` | Barang dari katalog owner. |
| `legacy_pos_product_id` | Text, nullable | Pemetaan ke ID produk POS yang sudah ada. Unik dalam cabang bila diisi. |
| `sell_price` | Numeric, nullable | Harga jual per satuan barang. Diisi ketika barang dijual. |
| `manual_unit_cost` | Numeric, nullable | Modal per satuan yang diisi manual. Dapat dipakai untuk bahan beli, barang jual langsung, atau menu yang modalnya diperkirakan. |
| `is_available` | Boolean | Ketersediaan barang jual pada cabang. |
| `is_active` | Boolean | Status penggunaan barang di cabang. |
| `created_at`, `updated_at` | Timestamptz | Waktu pencatatan dan perubahan. |

Pasangan `(business_id,item_id)` harus unik. Owner barang harus sama dengan owner cabang, ditegakkan melalui RLS dan constraint relasi yang sesuai. Input modal kosong disimpan sebagai `NULL`; modal nol merupakan nilai yang disengaja.

Harga dan modal memakai satuan `base_unit_id` yang sama. Jika Bean dicatat dalam kg dengan modal Rp160.000, modal tersebut berlaku untuk 1 kg. Konversi ke gram disiapkan pada tahap berikutnya melalui `item_units`. Pada tahap pertama, `manual_unit_cost` merupakan acuan manual yang dapat diisi dari harga pembelian atau estimasi produksi. Nilai ini diperbarui oleh pengguna sesuai kebutuhan.

Contoh data tahap pertama:

| Barang | Satuan | Bisa dibeli | Bisa dijual | Modal manual per unit | Harga jual per unit |
| --- | --- | --- | --- | --- | --- |
| Bean | kg | Ya | Tidak | Rp160.000 | — |
| Milk | l | Ya | Tidak | Rp20.000 | — |
| Coffee Latte | pcs | Tidak | Ya | Rp6.000 | Rp22.000 |
| Air mineral | pcs | Ya | Ya | Rp3.000 | Rp5.000 |

Tampilan admin terdiri atas judul/deskripsi, filter jenis barang Semua/Beli/Jual, dan tabel dengan aksi tambah/edit/arsip. Cabang mengikuti pemilih **Cabang aktif** di sidebar. Jenis Beli/Jual merupakan hasil filter atas dua penanda pada master. Saat membuat barang, pengguna mengisi nama, satuan, penanda beli/jual, modal manual, dan harga jual bila relevan. SKU dan deskripsi bersifat opsional.

Katalog owner dapat dipilih kembali ketika barang dipakai di cabang lain. Harga dan modal dapat berbeda untuk setiap cabang. Perubahan nama dan satuan berlaku pada identitas katalog bersama, sedangkan perubahan harga berlaku pada cabang yang diedit.

Perhitungan awal yang tersedia adalah `harga jual - modal manual` per unit, diberi label **estimasi selisih harga dan modal**. Coffee Latte pada contoh menghasilkan Rp16.000 per porsi. Laporan harus memberi penanda bila modal belum diisi. Perhitungan HPP otomatis dan laba bersih mengikuti tahap pengembangan berikutnya pada rancangan lengkap.

Resep, konversi kemasan, supplier, dokumen pembelian, lokasi gudang, ledger/saldo inventory, dan pajak menjadi cakupan tahap berikutnya. Tahap ini membentuk master dan acuan harga/modal untuk pengembangan tersebut.

Tabel `businesses` dan akun owner yang tersedia menjadi referensi cabang dan pemilik. Integrasi POS perlu memetakan ID produk lama, menjaga data lokal ketika offline, dan menyepakati sumber perubahan katalog. Master `catalog_items` harus dikelola terpisah dari pembersihan otomatis tabel mirror `products` yang sekarang berjalan pada sync.

## Keputusan utama

Gunakan satu master barang untuk identitas barang beli/jual. Jangan membuat dua master yang saling menduplikasi. Gunakan penanda independen `can_buy` dan `can_sell`, karena satu barang dapat memiliki kedua peran. Pisahkan master dari harga per cabang, resep, pembelian, mutasi stok, dan perhitungan pajak.

Contoh JSON Jurnal yang diberikan adalah representasi data. Field berformat rupiah, nama perusahaan, jumlah transaksi, dan penanda editable/deletable tidak membuktikan bahwa semuanya merupakan kolom satu tabel. Respons API dapat menggabungkan tabel, izin, dan hasil perhitungan. Yang layak diadaptasi adalah konsep barang, peran beli/jual, satuan, dan pengendalian stok.

| Contoh | Bisa dibeli | Bisa dijual | Cara stok awal yang disarankan |
| --- | --- | --- | --- |
| Biji kopi curah | Ya | Opsional | `self`: stok barang itu sendiri dalam gram |
| Susu | Ya | Opsional | `self`: stok dalam ml |
| Cup sekali pakai | Ya | Tidak | `self`: stok dalam pcs |
| Coffee Latte berdasarkan resep | Tidak | Ya | `recipe`: kurangi komponen saat dibuat/dijual |
| Air mineral botol | Ya | Ya | `self`: botol masuk saat dibeli, keluar saat dijual |
| Produk jual tanpa resep | Opsional | Ya | `none` jika tidak dilacak; biaya manual atau belum diketahui |
| Kue yang diproduksi lebih dulu | Opsional | Ya | `self`: produksi mengurangi bahan dan menambah stok kue; penjualan hanya mengurangi kue |

`can_sell` tidak sama dengan stok tersedia. Barang masih dapat menjadi barang jual meski stok habis. Menjadi bahan resep juga tidak berarti barang harus dilarang dijual langsung.

## Pembanding yang diteliti

| Platform / referensi | Pola yang terdokumentasi | Bagian yang diadaptasi |
| --- | --- | --- |
| [ERPNext Item](https://docs.frappe.io/erpnext/item) | Master Item mencakup bahan, barang jadi, dan jasa; pembelian/penjualan memiliki penanda masing-masing. | Satu master untuk identitas barang dan beberapa peran. |
| [Frappe Books Items](https://docs.frappe.io/books/items) | Item dapat memiliki tujuan Sales, Purchases, atau Both. | Tampilan daftar barang beli/jual dapat berbeda tanpa dua master. |
| [Loyverse Composite Items](https://help.loyverse.com/help/how-create-composite-item) | Komponen mempunyai kuantitas; biaya komposit dihitung dari komponen; penjualan dapat mengurangi stok komponen. | Model resep sederhana yang cocok untuk menu kafe. |
| [Odoo Units of Measure](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory/product_management/configure/uom.html) | Satuan pembelian dan satuan inventory dapat berbeda dengan konversi. | Beli kg/liter/karton, konsumsi gram/ml/pcs. |
| [Odoo Bill of Materials](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/manufacturing/basic_setup/bill_configuration.html) | Resep/BOM berisi komponen dan jumlah yang dibutuhkan untuk suatu output. | Header resep dan baris bahan terpisah. |
| [IAS 2 Inventories](https://www.ifrs.org/issued-standards/list-of-standards/ias-2-inventories/) | Biaya persediaan mencakup biaya perolehan, konversi, dan biaya relevan lain; FIFO atau weighted average dapat digunakan untuk barang yang saling dipertukarkan. | Bedakan harga supplier dari biaya persediaan dan HPP. Ini referensi konsep; kerangka akuntansi usaha tetap perlu ditetapkan. |

Rancangan berikut merupakan rekomendasi untuk aplikasi ini, bukan salinan skema internal platform-platform tersebut.

## Batas tenant dan cabang

Pada aplikasi sekarang, tenant secara praktis adalah `businesses.owner_id`. Untuk tahap awal, katalog dan supplier dapat dimiliki oleh owner tersebut. Cabang tetap memakai tabel `businesses` yang sudah ada.

Katalog bersama membuat Bean A tetap satu identitas pada dua cabang. Harga jual, kebijakan stok, resep, dan saldo dapat berbeda per cabang. Jangan menggabungkan produk lama hanya berdasarkan kesamaan nama; gunakan pemetaan eksplisit dari ID POS lama ke master baru.

Jika sejak awal bisnis menargetkan satu perusahaan dengan banyak akun owner/admin, putuskan mengganti ruang kepemilikan katalog ke `organization_id` sebelum implementasi. `auth.users.id` adalah identitas orang, bukan selalu identitas perusahaan. Modul keanggotaan perusahaan tidak wajib dibangun untuk inventory versi pertama.

Seluruh relasi harus memastikan cabang, item, resep, lokasi, supplier, dan dokumen berada pada tenant yang sama. Validasi aplikasi perlu didukung RLS dan foreign key majemuk yang sesuai; pemeriksaan UUID saja tidak cukup.

## Tabel fondasi rancangan lengkap

| Tabel | Kolom penting | Aturan / tujuan |
| --- | --- | --- |
| `units` | `id`, `code`, `name`, `dimension`, `allows_fraction` | Satuan seperti g, ml, pcs, kg, liter. `dimension`: massa, volume, atau hitungan. |
| `catalog_items` | `id`, `owner_id`, `sku`, `name`, `description`, `item_kind`, `base_unit_id`, `can_buy`, `can_sell`, `is_active` | Satu master barang. `item_kind` cukup goods/service; tidak perlu memaksa pilihan eksklusif beli/jual/bahan. SKU dapat opsional dengan keunikan per owner bila diisi. Kategori POS lama dipertahankan lewat pemetaan; normalisasi kategori katalog dapat menjadi lookup tambahan. |
| `item_units` | `id`, `item_id`, `unit_id`, `factor_to_base` | Konversi spesifik barang: 1 kemasan susu = 1.000 ml; 1 karton air = 24 botol. Unik per barang dan satuan/kemasan. Kemasan berbeda harus punya identitas berbeda. |
| `branch_product` | `id`, `business_id`, `item_id`, `legacy_pos_product_id`, `sell_price`, `manual_unit_cost`, `cost_source`, `default_purchase_unit_id`, `stock_mode`, `min_stock`, `is_active` | Pengaturan barang di cabang. Unik `(business_id,item_id)`; ID produk POS lama unik dalam cabang bila diisi. `cost_source`: manual/inventory/recipe untuk acuan biaya produk; inventory mensyaratkan pencatatan stok sendiri dan recipe mensyaratkan resep. Harga referensi beli bisa ditambahkan kemudian; bukan sumber biaya aktual. |
| `recipes` | `id`, `branch_product_id`, `version`, `output_qty_base`, `labor_cost_per_batch`, `production_overhead_per_batch`, `status`, `effective_from` | Resep opsional, dapat menghasilkan 1 porsi atau satu batch. Resep terbit yang sudah dipakai tidak ditimpa; buat versi baru. Maksimal satu versi aktif pada waktu tertentu per barang cabang. |
| `recipe_lines` | `id`, `recipe_id`, `component_item_id`, `quantity`, `unit_id`, `factor_snapshot`, `quantity_base` | Bahan dapat merujuk ke master barang yang sama. Kuantitas positif dan sesuai dimensi satuan bahan. Tidak boleh merujuk diri sendiri atau membentuk siklus resep. |

Kolom umum `created_at`, `updated_at`, dan jejak pembuat/pengubah ditambahkan sesuai kebutuhan audit. `image_url` pada master bersifat opsional; file gambar lebih cocok berada di storage daripada data URL berukuran besar dalam JSON konfigurasi.

`stock_mode` pada `branch_product`:

| Nilai | Perilaku |
| --- | --- |
| `none` | Penjualan tidak menggerakkan stok. Resep boleh dipakai hanya untuk estimasi biaya. |
| `self` | Gerakkan stok barang itu sendiri. Cocok untuk barang beli/jual langsung dan barang jadi yang diproduksi dahulu. |
| `recipe` | Penjualan/pembuatan sesuai kebijakan operasional mengonsumsi bahan resep; jangan sekaligus mengurangi stok Latte seolah-olah Latte adalah bahan tersimpan. |

Resep boleh kosong. Bila `stock_mode=recipe`, resep yang sah wajib tersedia sebelum penjualan dapat diposting sebagai pengurangan bahan. Tanpa resep, gunakan `none` atau `self` sesuai kondisi nyata. Jangan menganggap resep kosong berarti HPP nol.

Biaya manual memakai `NULL` bila belum diketahui. Nol berarti biaya memang nol, bukan belum diisi. Produk tanpa resep boleh dijual; laporan harus menandai HPP/laba yang belum lengkap.

`cost_source` dan `stock_mode` menjawab pertanyaan berbeda: biaya diperoleh dari mana, dan stok apa yang digerakkan. Misalnya `cost_source=recipe, stock_mode=none` dapat dipakai untuk estimasi bahan tanpa pelacakan stok. HPP transaksi tetap memerlukan snapshot dengan status kelengkapan biaya.

Satuan dasar dibuat tetap setelah ada transaksi. Jangan mengubah kg menjadi gram hanya dengan mengganti label. Transaksi dan resep terbit menyimpan faktor konversi saat digunakan agar perubahan kemasan tidak mengubah histori. Tidak ada konversi umum gram ke ml; diperlukan data khusus barang seperti densitas bila memang ingin mendukungnya.

## Tabel inventory operasional lanjutan

| Tabel | Kolom penting | Aturan / tujuan |
| --- | --- | --- |
| `suppliers` | `id`, `owner_id`, `name`, `contact`, `is_active` | Data pemasok. Identitas pajak/profil pajak dapat ditambahkan ketika modul pajak diimplementasikan. |
| `stock_locations` | `id`, `business_id`, `name`, `is_active` | Awali dengan satu lokasi stok utama per cabang. Menyiapkan identitas lokasi sejak awal memudahkan gudang/bar/transfer kemudian. |
| `purchases` | `id`, `business_id`, `supplier_id`, `location_id`, `document_type`, `document_no`, `document_date`, `status`, `currency_code`, `posted_at`, `reversal_of` | Versi awal menganggap pembelian diposting ketika barang diterima dan harganya diketahui. PO, penerimaan terpisah, faktur terpisah, dan termin bukan syarat awal. Status draft belum memengaruhi inventory. |
| `purchase_lines` | `id`, `purchase_id`, `item_id`, `quantity`, `unit_id`, `factor_snapshot`, `quantity_base`, `unit_price`, `discount_amount`, `allocated_receiving_cost`, `inventory_cost_amount` | Harga aktual pembelian dan konversi. Biaya penerimaan yang dialokasikan harus punya dasar alokasi yang konsisten. Retur/reversal merujuk dokumen asal. |
| `stock_movements` | `id`, `business_id`, `location_id`, `item_id`, `movement_kind`, `quantity_delta_base`, `unit_cost_snapshot`, `inventory_value_delta`, `occurred_at`, `posted_at`, `purchase_line_id`, `sale_line_id`, `reversal_of`, `idempotency_key`, `reason` | Buku mutasi: stok awal, pembelian, pemakaian resep, penjualan langsung, waste, penyesuaian, dan pembalikan. Referensi sumber yang tersedia memakai FK nyata; penyesuaian manual wajib memiliki alasan. |
| `stock_balances` | `location_id`, `item_id`, `quantity_base`, `inventory_value`, `average_unit_cost`, `version` | Cache saldo, unik `(location_id,item_id)`, diperbarui atomik bersama mutasi. Bukan angka yang diedit langsung pengguna. Pada tahap awal satu lokasi berarti satu kelompok biaya per cabang. |
| `transaction_lines` | `id`, `business_id`, `transaction_id`, `client_line_id`, `item_id`, `quantity`, `unit_id`, `factor_snapshot`, `net_sales_ex_tax`, `recipe_id`, `unit_material_cost`, `unit_conversion_cost`, `cogs_amount`, `cost_status` | Detail terstruktur yang merujuk `transactions` yang sudah ada, tanpa membuat tabel header penjualan kedua. Resep dan HPP disimpan sesuai saat posting. `cost_status`: unknown/provisional/final. |

`transaction_lines` perlu FK majemuk ke `(business_id, transactions.id)` karena ID transaksi yang sekarang berupa teks dan terikat cabang. `client_line_id` harus stabil pada pengiriman ulang; jangan menghasilkan ID baru setiap sync.

Ledger merupakan sumber audit stok; cache saldo merupakan percepatan pembacaan. Nilai persediaan dan HPP tetap perlu rekonsiliasi dan koreksi bernilai bila informasi biaya berubah. Harga terakhir di supplier bukan otomatis average cost.

Saldo awal dicatat sebagai mutasi `opening`, bukan hanya `init_quantity` di master. Koreksi dokumen terposting menggunakan reversal/penyesuaian, bukan menghapus jejak. Item yang sudah direferensikan transaksi diarsipkan, bukan dihapus permanen.

Perubahan default harga, nama, dan resep tidak boleh menghitung ulang histori berdasarkan master terbaru. Simpan snapshot nama/harga/biaya/faktor yang diperlukan di transaksi. Harga opsi menu seperti extra shot juga harus mempertimbangkan tambahan bahan/biayanya; `extraPrice` sekarang hanya tambahan harga jual.

## Contoh Coffee Latte dan satuan

Angka berikut adalah simulasi, bukan rekomendasi resep atau harga pasar.

| Barang | Pembelian contoh | Satuan dasar | Biaya per satuan dasar |
| --- | --- | --- | --- |
| Bean | 1 kg seharga Rp160.000 | g | Rp160/g |
| Milk | 1 liter seharga Rp20.000 | ml | Rp20/ml |
| Cup | 100 pcs seharga Rp70.000 | pcs | Rp700/pcs |

Resep output satu porsi Latte:

| Komponen | Kebutuhan | Biaya |
| --- | --- | --- |
| Bean | 20 g | Rp3.200 |
| Milk | 50 ml | Rp1.000 |
| Cup | 1 pcs | Rp700 |
| Total bahan langsung | | Rp4.900 |

Menjual dua porsi dengan `stock_mode=recipe` mengurangi 40 g bean, 100 ml susu, dan 2 cup. Tidak ada pengurangan stok Latte tambahan.

Biaya resep per unit = `(jumlah biaya komponen satu batch + tenaga kerja produksi batch + overhead produksi batch) / output batch`. Jika kebutuhan resep sudah memasukkan susu terbuang, jangan menambahkan persentase waste yang sama sekali lagi.

Untuk persediaan, rekomendasi awal adalah moving weighted average. Misalnya 1.000 g bean lama bernilai Rp150.000 ditambah 1.000 g baru Rp170.000 menghasilkan Rp160/g. Formula: `(nilai stok lama + biaya persediaan masuk) / (kuantitas lama + kuantitas masuk)`. Ini berlaku pada penerimaan biasa dengan saldo yang valid, bukan aturan otomatis untuk semua kasus stok negatif atau retur. Referensi metode: [Odoo valuation](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory/inventory_valuation/cheat_sheet.html).

Resep memberi estimasi kebutuhan. Stok opname, pemakaian internal, tumpahan, expired, dan waste tetap perlu mutasi tersendiri agar selisih aktual dapat diketahui. Batch/expired dan FEFO boleh ditambahkan kemudian; FEFO untuk memilih barang fisik tidak harus sama dengan metode nilai biaya.

Barang yang diproduksi lebih dulu, seperti sirup satu botol atau kue satu loyang, nantinya membutuhkan pencatatan produksi: bahan keluar dan output masuk. Jangan mengurangi bahan lagi saat output yang sudah diproduksi dijual. Bentuk resep di atas tetap bisa digunakan; dokumen produksi ditambahkan ketika fitur itu diperlukan.

## HPP, laba, dan biaya bersama

Tampilkan angka yang berbeda dengan nama yang jelas:

| Ukuran | Perhitungan / makna |
| --- | --- |
| Biaya bahan per porsi | Bahan dan kemasan yang digunakan. |
| HPP per porsi | Biaya bahan + biaya konversi yang memang masuk HPP menurut kebijakan biaya yang ditetapkan. Jangan otomatis menyebut biaya bahan saja sebagai HPP lengkap. |
| Laba kotor | Penjualan neto tanpa pajak yang dipungut untuk pihak lain, dikurangi HPP. |
| Laba bersih usaha per periode | Laba kotor dikurangi biaya penjualan/administrasi serta beban lain, ditambah pendapatan lain, dikurangi beban pajak penghasilan. |
| Estimasi laba bersih per produk | Bagian laba/biaya bersama yang dialokasikan memakai dasar yang dipilih dan dinyatakan kepada pengguna. |

Contoh lanjutan: biaya bahan Rp4.900 + tenaga kerja produksi Rp600 + overhead produksi Rp500 menghasilkan estimasi HPP Rp6.000. Bila penjualan neto tanpa pajak sebesar Rp22.000, laba kotor Rp16.000. Setelah biaya pembayaran Rp300 dan biaya penjualan/administrasi yang dialokasikan Rp3.000, estimasi laba sebelum PPh Rp12.700. Laba setelah PPh masih dikurangi alokasi beban PPh periode terkait; tidak ada tarif PPh per Latte yang diasumsikan dalam contoh ini.

Tarif tenaga kerja/overhead pada resep adalah standar/estimasi. Pembebanan terhadap biaya aktual periode dan selisihnya harus direkonsiliasi sebelum angka diklaim sebagai biaya aktual final. Bila komponen itu belum dicatat, tampilkan biaya bahan atau HPP estimasi dengan jelas.

Perhitungan utama laba bersih sebaiknya per cabang dan periode. Unit terjual atau proporsi penjualan neto dapat menjadi dasar alokasi biaya bersama. Periode berbeda dapat memakai dasar yang berbeda hanya melalui kebijakan yang tercatat; laporan per produk harus berlabel estimasi/alokasi. Angka harian dapat masih provisional sebelum semua biaya dan pajak masuk.

Tenaga kerja atau overhead yang sudah dimasukkan ke HPP jangan dibebankan lagi seluruhnya sebagai biaya operasional. Pembelian bean juga tidak boleh otomatis dihitung sebagai beban operasional sekaligus sebagai HPP ketika dipakai. Bedakan pengeluaran kas, pembelian persediaan, dan beban laba-rugi. Pada kode sekarang, pengeluaran kas berada di `expenses`; modul baru perlu klasifikasi dan hubungan sumber agar pembelian persediaan tidak dihitung dua kali.

Pembayaran piutang, bon, dan uang muka bukan selalu pendapatan/beban periode pembayaran. Untuk laba, penjualan dan pembeliannya perlu status posting/recognition; untuk arus kas gunakan penerimaan/pembayaran. Fitur hutang supplier dan pembayaran bertahap dapat memakai `purchase_payments` di tahap berikutnya.

## Pajak untuk tahap berikutnya

Jangan memasukkan satu kolom `pph_percentage` di setiap produk lalu menganggap semua transaksi tunduk aturan itu. Kewajiban bergantung pada jenis transaksi, pihak, status usaha, lokasi, dokumen, dan aturan yang berlaku pada tanggal transaksi.

Sebagai contoh konsep, PPh 22 mengatur pemungutan pada pembayaran barang/kegiatan tertentu dan pihak pemungut tertentu, bukan setiap pembelian barang secara umum. PPh 23 mencakup penghasilan tertentu seperti jasa/sewa. Pajak konsumsi usaha kuliner juga perlu membedakan PBJT dan PPN sesuai kondisinya. Rujukan: [PMK 51/2025](https://jdih.kemenkeu.go.id/dok/pmk-51-tahun-2025/files), [DJP PPh 23](https://www.pajak.go.id/id/pph-pasal-23), dan [Kemenkeu tentang PBJT/PPN kuliner](https://opini.kemenkeu.go.id/pages/read/satu-piring-dua-pajak-meluruskan-salah-kaprah-pbjt-dan-ppn-di-usaha-kuliner). Tarif dan penerapan belum ditentukan untuk usaha ini.

| Tambahan nanti | Data yang disiapkan secara konseptual |
| --- | --- |
| `tax_rules` | Kode/jenis pajak, dasar perhitungan, rate, berlaku dari/sampai, yurisdiksi, perlakuan inklusif/eksklusif, perlakuan pemotongan/pemungutan. Aturan yang sudah digunakan tidak diedit menimpa histori. |
| `purchase_tax_lines` | FK dokumen/baris pembelian, rule/version, snapshot dasar, tarif, jumlah, dan perlakuan akuntansinya. |
| `sale_tax_lines` | FK transaksi/baris penjualan, rule/version, snapshot dasar, tarif, jumlah, dan perlakuan akuntansinya. |
| `period_income_taxes` | Cabang/usaha, periode, jenis/regime, dasar dan hasil perhitungan, status estimasi/final, serta referensi penyelesaian/koreksi. Entitas wajib pajak dapat mencakup beberapa cabang; jangan menghitung kewajiban perusahaan berkali-kali. |
| `cost_allocation_rules` dan hasil alokasinya | Periode, kelompok biaya, dasar pembagian, nilai yang dialokasikan, status penutupan. Memisahkan biaya produksi, administrasi, biaya pembayaran, dan pajak. |

PPh yang dipotong, kredit pajak, utang pajak sebagai pemungut, dan beban pajak bukan satu hal yang sama. Jangan otomatis memasukkan seluruh nilai pemotongan ke HPP atau mengurangi laba dua kali. Pajak yang dipungut untuk disetor juga bukan otomatis pendapatan usaha. Perlakuan biaya perolehan, pajak yang dapat/tidak dapat dikreditkan, dan regime pajak perlu dikonfirmasi ketika profil usaha sudah jelas.

Tidak perlu membangun seluruh modul pajak sekarang. Yang diperlukan sejak awal adalah pemisahan subtotal, diskon, pajak, biaya, HPP, dan nilai pembayaran; jejak tanggal; serta ruang relasi dokumen yang konsisten. Jangan hanya menyimpan total akhir atau teks rupiah.

## Dampak pada aplikasi yang sudah ada

| Temuan kode saat ini | Keputusan sebelum inventory diimplementasikan |
| --- | --- |
| `products` adalah mirror POS dengan PK `(business_id,id)`; `mirrorProducts()` pada `admin-dashboard/src/app/api/sync/route.ts` menghapus produk yang tidak ada dalam payload kiriman. | Master baru sebaiknya bernama `catalog_items` agar tidak bercampur dengan mirror lama. Biarkan mirror sebagai kompatibilitas sementara. Bahan beli tidak boleh dihapus hanya karena tidak ditampilkan POS. |
| Data master POS dibagikan melalui `businesses.pos_config`; versi terbaru menang untuk seluruh konfigurasi. | Saldo dan buku mutasi inventory tidak boleh memakai mekanisme saling menimpa seluruh JSON. Admin/server menjadi sumber master inventory dan posting stok. |
| `Product.stock` merupakan number dengan sentinel `-1`; API mirror menggunakan `Math.trunc()` pada stock. | Kuantitas bahan wajib desimal. Hentikan pemotongan desimal pada alur inventory dan ganti sentinel dengan `stock_mode`. |
| `saveTransaction()` mengurangi stok produk jual secara lokal dan membatasi minimal nol. | Untuk barang berbahan, konsumsi harus berasal dari resep; jangan mengurangi produk dan bahan sekaligus. Stok lokal merupakan perkiraan sampai direkonsiliasi server. Jangan menyembunyikan selisih dengan memaksa nol. |
| `cancelTransaction()` mengembalikan stok produk secara otomatis. | Untuk minuman yang sudah dibuat lalu dibatalkan, bahan belum tentu kembali. Pisahkan restock fisik dari waste/refund. Jangan selalu membalik semua pemakaian bahan. |
| Detail penjualan ada di `transactions.items` JSON. | Pertahankan snapshot lama, lalu tambahkan detail terstruktur dengan ID baris stabil untuk posting bahan dan snapshot HPP. |
| `costPrice` manual tersimpan di katalog dan snapshot produk pada transaksi. | Jadikan biaya manual/fallback yang jelas statusnya. Estimasi resep, biaya aktual inventory, dan histori HPP bukan satu field yang terus ditimpa. |
| Opsi menu hanya memuat label dan tambahan harga. | Siapkan identitas opsi stabil serta pemetaan tambahan/penggantian bahan di tahap varian resep. Extra shot atau susu oat tidak boleh hanya mengubah harga jual. |

Untuk migrasi data saat implementasi: jangan langsung menghapus tabel/JSON lama. Buat pemetaan eksplisit, backfill hanya dengan hasil yang dapat diverifikasi, sediakan pembacaan kompatibel, lalu alihkan penulisan. Jangan menciptakan histori HPP final untuk transaksi lama yang biaya/resepnya tidak diketahui.

## Aturan teknis yang perlu dijaga

- UUID untuk master/dokumen baru; ID POS lama dipertahankan lewat pemetaan. Semua relasi harus menjaga batas tenant/cabang.
- Kuantitas dan faktor konversi memakai `numeric`, misalnya `numeric(18,6)`; biaya per g/ml perlu presisi lebih tinggi daripada format tampilan uang. Hitung di SQL numeric atau pustaka desimal, lalu bulatkan dengan aturan yang konsisten.
- Posting satu dokumen, ledger, saldo, dan HPP harus atomik pada server. Gunakan fungsi database/transaksi dengan penguncian saldo yang sesuai; bukan beberapa request terpisah yang bisa gagal sebagian.
- Terapkan idempotency key dan unique constraint per sumber/posting. Mengirim ulang transaksi atau memperbarui status pembayaran bon tidak boleh mengurangi stok lagi.
- Catat `occurred_at` dan `posted_at`. Late sync, dokumen mundur tanggal, stok kurang/negatif, dan periode tertutup membutuhkan kebijakan rekonsiliasi; jangan menjalankan formula average biasa tanpa penanganan khusus.
- Karena POS offline, transaksi penjualan tidak boleh hilang ketika posting stok bermasalah. Simpan status inventory/HPP yang perlu ditinjau, tampilkan perkiraannya, dan finalkan melalui rekonsiliasi. Ketersediaan global tidak bisa dijamin real-time ketika beberapa perangkat offline.
- Resep terbit, faktor transaksi, dan HPP historis tidak mengikuti perubahan master secara retroaktif. Koreksi perlu audit trail dan kebijakan periode tutup buku.
- Untuk penjualan yang dibatalkan setelah bahan dipakai, keputusan fisik dan perlakuan biayanya harus eksplisit; jangan menganggap refund berarti bahan kembali ke gudang.
- Tambahkan index untuk pencarian item tenant, `branch_product(business_id,item_id)`, resep per barang cabang, mutasi per lokasi/barang/waktu, serta sumber transaksi.
- Query daftar mengambil data dengan join/agregasi/batch. Jangan mengambil resep/harga bahan satu per satu untuk setiap produk; hindari N+1.

## Tahapan implementasi

| Tahap | Hasil yang dibangun | Yang belum perlu |
| --- | --- | --- |
| 1. Master barang sederhana | Tiga tabel `units`, `catalog_items`, dan `branch_product`. Penanda beli/jual, modal manual, harga jual per cabang, satuan tunggal per barang, serta pemetaan POS lama. | Resep, konversi satuan, supplier, pembelian, lokasi, ledger, dan pajak masuk tahap lanjutan. |
| 2. Resep dan estimasi HPP | `item_units`, `recipes`, dan `recipe_lines`, dengan kebutuhan bahan, konversi, dan biaya produksi yang diperhitungkan secara jelas. | Penilaian persediaan aktual mengikuti pencatatan inventory. |
| 3. Inventory yang tercatat | Supplier, pembelian, lokasi default, ledger, cache saldo, detail transaksi, moving average, stok awal, waste, adjustment, idempotency, dan rekonsiliasi offline. | Banyak gudang, batch/expired, PO dan faktur terpisah bila operasional belum memerlukan. |
| 4. Laba dan pajak | Klasifikasi biaya yang ada, alokasi produksi/operasional, laporan laba per periode, estimasi laba per produk, aturan pajak dan snapshot berdasarkan profil usaha. | Integrasi akuntansi eksternal atau fitur perusahaan lain yang belum diperlukan. |
| 5. Perluasan sesuai kebutuhan | Produksi batch, transfer lokasi/cabang, supplier price list, varian/modifier resep, batch/expired/FEFO, pembayaran hutang supplier. | Tidak harus dibuat sebelum kebutuhan nyata muncul. |

Model ini menyiapkan fondasi yang relatif stabil, bukan menjamin tidak ada migration lagi. Tambahan tabel untuk fitur baru tetap wajar; yang dihindari adalah memecah identitas barang atau mengganti seluruh model stok ketika resep, cabang, dan pajak mulai digunakan.

Keputusan bisnis yang perlu ditetapkan sebelum menulis migration: cakupan tenant (owner atau organisasi), kebijakan barang dibuat saat dipesan versus produksi awal, daftar satuan/kemasan nyata, dasar biaya produksi, aturan stok kurang saat offline, cara alokasi biaya bersama, entitas serta lokasi pajak, dan apakah stok awal bisa diverifikasi.
