# Form produk: penjualan dan pembelian pertama

Form Produk Baru/Edit Produk memisahkan pengaturan **Dijual** dan **Dibeli**.
Checkbox tetap menggunakan can_sell/can_buy yang sudah ada; barang boleh memiliki
keduanya. Panel Penjualan menampilkan harga jual per satuan dasar dan kategori
kasir. Produk jual yang bukan barang beli dapat mengisi modal/HPP acuan opsional;
nilai ini hanya estimasi biaya, tidak membuat pengeluaran.

## Produk yang dibeli

Pada produk baru, panel Pembelian menyediakan checkbox **Catat pembelian pertama**.
Default tidak dicentang. Jika barang baru direncanakan untuk dibeli, pengguna cukup
menyimpan identitasnya; tidak wajib memasukkan harga, jumlah atau pengeluaran.

Jika pembelian pertama dicatat, pengguna mengisi:

- Tanggal pembelian.
- Supplier opsional milik owner.
- Jumlah dalam satuan dasar produk.
- Total pembelian untuk seluruh jumlah barang, maksimal dua desimal rupiah.
- Catatan opsional.

Harga beli acuan per satuan dihitung dari total/jumlah dengan presisi enam desimal
dan disimpan pada cost_price existing. Harga jual tetap terpisah pada price.
Pembelian ini memakai RPC admin_record_expenses yang sudah ada, sehingga satu
pengeluaran terhubung dengan purchases/purchase_lines yang berstatus posted.
Pembelian berikutnya tetap dicatat melalui menu Pengeluaran. Pada edit produk,
harga beli acuan dapat diedit tanpa membuat pengeluaran atau pembelian baru.

## Stok dan konsistensi

Jika pelacakan aktif, produk dibuat dengan stok nol lalu RPC menambahkan jumlah
pembelian. Input stok awal tambahan disembunyikan dan server menolak saldo awal
tambahan agar stok tidak dihitung dua kali. Tanpa pelacakan, pembelian tetap masuk
riwayat dan pengeluaran, tetapi saldo tetap -1/Unlimited. Jika tidak mencatat
pembelian pertama, saldo awal manual tetap tersedia dan tidak membuat pembelian.

Tidak ada migration, tabel, kolom, atau perubahan RPC. Pembuatan produk dan RPC
pengeluaran merupakan dua permintaan, sehingga keduanya bukan satu transaksi
database. Permintaan pembelian disimpan pada products.raw._inventory.initialPurchase
bersama creationSignature dan event pending. Jika langkah berikutnya gagal,
produk tidak dihapus; pesan menjelaskan bahwa produk sudah tersimpan dan pengguna
dapat menyimpan ulang form yang sama atau melanjutkan dari Riwayat.

Operation ID tetap selama dialog dibuka. RPC memakai ID tersebut sebagai dokumen
dan baris pengeluaran/pembelian. Retry setelah kehilangan respons menggunakan
entry_request yang sudah tercatat, termasuk versi produk semula. Retry tidak
menggandakan produk, pembelian, pengeluaran atau stok. Finalisasi jurnal memakai
CAS updated_at dan hanya memperbarui metadata, tanpa mengulang perubahan saldo.
Produk dengan pembelian pertama pending dilindungi dari edit/hapus biasa sampai
pembelian diselesaikan. Pemeriksaan kepemilikan, cabang aktif, harga, tanggal,
supplier, foto, dan versi tetap berlaku. Tidak ada query per baris daftar produk.

## Modal

Dialog menggunakan overflow-hidden pada batas luar dan satu area scroll pada isi.
Header tetap berada di atas area scroll. Radius luar memotong scrollbar pada
batas modal; area isi memakai min-height: 0 dan overscroll containment. Perbaikan
ini juga berlaku untuk dialog produk lain yang memakai komponen Modal yang sama.

## Pengujian

Tes mencakup pembelian opsional, produk Dibeli+Dijual, harga jual vs harga beli,
saldo Unlimited, validasi jumlah/tanggal/supplier, pencegahan stok awal ganda,
serta recovery sebelum RPC dan sesudah respons commit hilang. Pengujian lokal
memakai akun/cabang sementara melalui Auth/RLS dan RPC asli, lalu membersihkan
fixture. Data production dan data asli hasil pemulihan tidak diubah.
