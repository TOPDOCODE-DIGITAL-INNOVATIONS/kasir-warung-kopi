# Koreksi pengeluaran

Fitur tersedia di admin dashboard dan aplikasi kasir. Tidak ada perubahan migration.

- Admin: ikon pensil pada setiap catatan membuka modal edit, sesuai cabang aktif dan kepemilikan akun login.
- Kasir: Supervisor/Owner dapat menekan ikon pensil untuk mengisi form dengan data lama. Tombol Batal Edit mengembalikan mode tambah.
- Pengeluaran biasa: kategori, catatan, nominal, jenis harian/bulanan, dan tanggal/bulan dapat dikoreksi.
- Pengeluaran terkait `purchase_line_id`: hanya kategori dan catatan. Jumlah, satuan, nominal, tanggal, supplier, pembelian, dan stok tidak diubah agar dokumen tetap konsisten.
- Pengeluaran laci: tanggal, sumber dana, dan shift asal dipertahankan. Nominal hanya dapat dikoreksi di kasir saat shift asal masih aktif di perangkat yang sama; selisihnya memperbarui `expensesCash`. Shift tertutup tidak ditulis ulang.
- ID, pencatat asli, waktu pembuatan, dan relasi produk/pembelian tetap dipertahankan.

## Hapus pengeluaran

Admin menyediakan ikon hapus dengan dialog konfirmasi. Server memeriksa cabang, kepemilikan, dan versi sebelum menghapus; penanda penghapusan disimpan pada `deleted_records` yang sudah ada. Jika catatan berubah selama penghapusan, operasi dibatalkan dan penanda operasi tersebut dibersihkan.

Pengeluaran terkait pembelian/stok tidak dapat dihapus dari admin maupun kasir melalui fitur ini. Untuk pengeluaran laci, penghapusan dari admin menyesuaikan saldo shift yang masih aktif saat perangkat kasir melakukan sinkronisasi. Rekap shift yang sudah ditutup tetap dipertahankan, sesuai perilaku hapus kasir sebelumnya.

API juga memeriksa penanda penghapusan ketika menerima kiriman pengeluaran. Salinan lama tidak dibuat ulang; ID yang telah dihapus dikembalikan ke kasir agar salinan lokal ikut dihapus meskipun perangkat belum pernah melakukan pull.

## Ekspor tabel PDF

Tombol **Ekspor PDF** tersedia di admin dan kasir. Pada dialog cetak browser, pilih **Simpan sebagai PDF**. Dokumen khusus laporan dicetak dalam A4 landscape; sidebar dan tombol aplikasi tidak ikut dicetak.

- Admin memakai cabang aktif, periode, dan kategori yang dipilih, dengan data dari query halaman yang sudah dipaginasi. Ekspor dinonaktifkan jika pemuatan data gagal.
- Kasir mengekspor pengeluaran harian dan bulanan pada bulan yang sedang ditampilkan, dari data lokal yang tersedia. Sinkronkan terlebih dahulu untuk memperoleh data perangkat lain.
- Urutan tanggal paling awal; biaya bulanan diurutkan pada tanggal 1 bulan tersebut. Jika tanggal sama, gunakan waktu pembuatan dan ID.
- Kolom **Pembelian** berisi catatan yang sudah dirapikan spasinya di awal/akhir; jika kosong, gunakan nama kategori. Kategori tetap menjadi kolom tersendiri.
- Tanggal, jenis, produk/jumlah/satuan, supplier, nominal, sumber dana, pencatat/waktu, ID, kelompok input, dan shift turut dicantumkan bila tersedia, beserta cabang, periode, dan total.
- Modul laporan dipakai bersama melalui `shared/expense-report.ts`; tidak ada dependency, migration, atau query per baris tambahan. Data pengguna di-escape sebelum dimasukkan ke dokumen cetak.

## Akses dan sinkronisasi

RLS owner pada tabel `expenses` hanya mengizinkan baca. Server action membaca dengan sesi owner, memverifikasi kepemilikan cabang kembali, kemudian menggunakan client server dengan token cabang untuk update yang dibatasi ID, cabang, dan versi `synced_at`. Token tidak dikirim ke komponen client. Kebijakan database yang sudah ada tetap digunakan.

Edit kasir menyimpan snapshot `editBase` lokal; tarikan server menyertakan `serverVersion` dari `synced_at`. API membaca data lama secara bertahap (maksimal 500 ID per query), memeriksa snapshot, lalu menulis koreksi dengan pemeriksaan versi. Pengiriman ulang dari kasir lama tanpa penanda edit tidak menimpa catatan yang telah tersimpan.

Saat konflik, API memberi respons 409 beserta data terkini. Kasir memuat data tersebut hanya bila isian lokal belum berubah lagi selama request, menyesuaikan saldo laci aktif bila perlu, dan menampilkan pesan bahwa koreksi belum tersimpan. Pengguna dapat memeriksa data lalu mengedit ulang. Pengeluaran baru tetap bekerja tanpa versi server.
