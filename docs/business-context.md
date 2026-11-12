# Konteks cabang admin

Pemilih **Cabang aktif** berada di sidebar, di atas identitas owner. Pada layar kecil pemilih tersedia di bawah navigasi. Daftarnya hanya berisi cabang milik akun yang login. Saat belum ada pilihan, cabang pertama menurut waktu pembuatan dan ID digunakan. Akun tanpa cabang mendapat kondisi kosong dan tautan membuat cabang.

Pilihan disimpan selama satu tahun dalam cookie HTTP-only `kasir_active_business`, berlaku untuk seluruh dashboard. Cookie hanya menyimpan preferensi: server selalu memeriksa kembali kepemilikan cabang. Cookie tidak valid, cabang yang sudah dihapus, atau cookie dari akun lain kembali ke cabang pertama yang dapat diakses. Kegagalan membaca cabang menghasilkan error, bukan kueri tanpa filter.

Transaksi, pengeluaran, data lama dan rekap, produk, user kasir, Cabang & Token, sinkronisasi, dan backup hanya menggunakan cabang aktif. Parameter lama `?b=` pada halaman-halaman tersebut tidak mengganti konteks. Ganti cabang melalui sidebar. Membuat cabang baru otomatis memilih cabang tersebut.

**Overview merupakan pengecualian.** Filter lokalnya tetap memakai `?b=`. Tanpa filter, total, grafik, dan produk terlaris mencakup semua cabang milik owner, termasuk ketika sidebar memilih satu cabang. Mengubah filter Overview tidak mengubah cabang aktif.

Server Action produk, user, cabang, dan rekap memeriksa konteks sebelum menulis. ID produk/rekap/aturan buku juga dibatasi ke cabang aktif. Formulir dari cabang sebelumnya ditolak atau tidak dapat mengubah baris cabang lain. Klien halaman direset saat cabang berganti agar dialog dan isian lama tidak terbawa. Tab lain menerima konteks terbaru pada permintaan berikutnya; tampilan tab yang masih terbuka perlu dimuat ulang.

API backup mengotorisasi cabang aktif sebelum menggunakan client admin. Tanpa parameter cabang, unduhan tetap hanya berisi cabang aktif. Permintaan dengan ID cabang berbeda ditolak agar unduhan dari halaman lama tidak salah sasaran. Rentang tanggal dan pilihan kategori JSON/CSV tetap berlaku.

Daftar cabang dimuat bertahap dan dipakai bersama oleh layout/halaman melalui cache React dalam satu permintaan. Data produk, transaksi, dan pembelian tetap diambil per kelompok, tanpa kueri per baris. Satuan dan daftar supplier merupakan referensi bersama milik katalog/owner sesuai model database; data transaksi dan stok selalu dibatasi cabang.

Tidak ada perubahan migration. Pemilih ini mengatur konteks **admin dashboard**. Perangkat aplikasi kasir tetap terhubung ke cabangnya melalui token sinkronisasi masing-masing; mengganti konteks admin tidak mengganti token perangkat kasir.
