# Konteks cabang admin

Pemilih **Cabang aktif** berada di header, di sebelah menu akun. Header tersedia pada desktop dan layar kecil. Menu akun menampilkan nama, email, role Owner, serta tombol Keluar. Sidebar tetap selebar 256px; pada layar kecil navigasi dibuka lewat tombol menu. Daftarnya hanya berisi cabang milik akun yang login. Saat belum ada pilihan, cabang pertama menurut waktu pembuatan dan ID digunakan. Akun tanpa cabang mendapat kondisi kosong dan tautan membuat cabang.

Pilihan disimpan selama satu tahun dalam cookie HTTP-only `kasir_active_business`, berlaku untuk seluruh dashboard. Cookie hanya menyimpan preferensi: server selalu memeriksa kembali kepemilikan cabang. Cookie tidak valid, cabang yang sudah dihapus, atau cookie dari akun lain kembali ke cabang pertama yang dapat diakses. Kegagalan membaca cabang menghasilkan error, bukan kueri tanpa filter.

Transaksi, pengeluaran, data lama dan rekap, produk, user kasir, Cabang & Token, sinkronisasi, dan backup hanya menggunakan cabang aktif. Parameter lama `?b=` pada halaman-halaman tersebut tidak mengganti konteks. Ganti cabang melalui header. Membuat cabang baru otomatis memilih cabang tersebut.

**Overview merupakan pengecualian.** Filter lokalnya tetap memakai `?b=`. Tanpa filter, total, grafik, dan produk terlaris mencakup semua cabang milik owner, termasuk ketika header memilih satu cabang. Mengubah filter Overview tidak mengubah cabang aktif.

Filter Overview memakai formulir **Cabang**, **Tanggal mulai**, dan **Tanggal akhir**, lalu tombol Terapkan. Parameter `from` dan `to` inklusif mengikuti WIB, dengan default tujuh hari termasuk hari ini. Rentang satu hari diperbolehkan; maksimum tiga bulan kalender (misalnya 12 November–11 Februari, akhir bulan menyesuaikan kalender). Browser dan server memvalidasi tanggal. URL tidak valid kembali ke default dengan pemberitahuan; Server Action menolak rentang tidak valid sebelum mengakses data. Reset mengembalikan semua cabang dan tujuh hari terakhir.

Seluruh kartu, grafik, sepuluh transaksi terbaru dan produk terlaris mengikuti filter tersebut. Kartu menampilkan penjualan, jumlah transaksi POS selesai, bon belum lunas dari transaksi pada rentang ini, pemasukan (penjualan ditambah kelebihan pembayaran), serta pengeluaran. Penjualan termasuk rekap manual; pemasukan ini bukan laporan arus kas dan masih mencakup nilai penjualan bon. Rekap/pengeluaran bulanan memakai tanggal 1 sebagai acuan, mengikuti `anchor_date` pada laporan lain, tanpa prorata. Produk terlaris dihitung dari kuantitas snapshot item transaksi selesai, tanpa menebak rincian produk dari rekap manual. Panel menampilkan sepuluh besar dengan scroll; **Lihat Semua** membuka modal seluruh peringkat dalam filter yang sama.

Query Overview berada di `admin-dashboard/src/app/dashboard/actions.ts`. Pengambilan transaksi ringkasan, pengeluaran dan rekap dilakukan per halaman 500 baris dengan urutan stabil; transaksi terbaru dibatasi sepuluh. Semua query dibatasi daftar cabang milik owner dan rentang tanggal, tanpa query per transaksi/produk. Error pada halaman berikutnya menggagalkan ringkasan, bukan menampilkan total parsial. RPC `dashboard_summary` lama tetap tersedia tetapi tidak lagi dipakai halaman Overview; tidak memerlukan migration baru.

Server Action produk, user, cabang, dan rekap memeriksa konteks sebelum menulis. ID produk/rekap/aturan buku juga dibatasi ke cabang aktif. Formulir dari cabang sebelumnya ditolak atau tidak dapat mengubah baris cabang lain. Klien halaman direset saat cabang berganti agar dialog dan isian lama tidak terbawa. Tab lain menerima konteks terbaru pada permintaan berikutnya; tampilan tab yang masih terbuka perlu dimuat ulang.

API backup mengotorisasi cabang aktif sebelum menggunakan client admin. Tanpa parameter cabang, unduhan tetap hanya berisi cabang aktif. Permintaan dengan ID cabang berbeda ditolak agar unduhan dari halaman lama tidak salah sasaran. Rentang tanggal dan pilihan kategori JSON/CSV tetap berlaku.

Daftar cabang dimuat bertahap dan dipakai bersama oleh layout/halaman melalui cache React dalam satu permintaan. Data produk, transaksi, dan pembelian tetap diambil per kelompok, tanpa kueri per baris. Satuan dan daftar supplier merupakan referensi bersama milik katalog/owner sesuai model database; data transaksi dan stok selalu dibatasi cabang.

Tidak ada perubahan migration. Pemilih ini mengatur konteks **admin dashboard**. Perangkat aplikasi kasir tetap terhubung ke cabangnya melalui token sinkronisasi masing-masing; mengganti konteks admin tidak mengganti token perangkat kasir.
