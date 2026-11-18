# Foto produk opsional

Foto berada pada form Produk Baru/Edit Produk, tepat di bawah Deskripsi. Pengguna dapat memilih, mengganti, atau menghapus foto sebelum menyimpan. Form menampilkan pratinjau; tanpa foto POS memakai ikon kategori yang tersedia. Jika URL foto gagal dimuat, kartu POS kembali ke ikon kategori. Tidak mengubah pengaturan stok, resep, role, atau autentikasi kasir.

Foto sumber JPG, PNG, atau WebP maksimal 10 MiB dan 64 megapiksel. Browser mengubahnya menjadi WebP dengan sisi terpanjang maksimal 1280 px, mempertahankan rasio dan tidak memperbesar foto kecil. Kualitas dicoba dari 0,82 sampai 0,5, kemudian dimensi dikurangi bertahap jika masih terlalu besar. Hasil wajib **kurang dari 200 KiB** (maksimal 204.799 byte); tidak ada fallback file melebihi target. Pratinjau dan ukuran yang tampil adalah hasil kompresi. Simpan dinonaktifkan selama pemrosesan. Browser yang gagal menghasilkan WebP mendapat pesan kesalahan.

File tidak ikut payload Server Action produk: saat Simpan, file hasil kompresi dikirim ke `POST /api/products/image`, kemudian URL hasilnya disimpan di kolom existing `products.image_url`. Pemilihan file atau pembatalan sebelum Simpan tidak mengunggah file. Foto yang sudah diunggah dipakai ulang ketika mencoba menyimpan kembali form yang sama. Lihat [Canvas.toBlob](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob) untuk format dan parameter kualitas browser.

Endpoint memeriksa sesi Supabase, cabang aktif, ukuran, MIME dan signature file. Bucket publik `product-images` dipersiapkan melalui migration `20261116050000_product_image_storage.sql`. Path berformat `owner_id/business_id/inventory_id/uuid.ext`. Policy Storage mengizinkan upload/list hanya pada folder pemilik dan cabang miliknya. File bersifat immutable, tidak memakai upsert; URL dapat dibaca publik agar kasir berbasis token cabang bisa menampilkannya. Simpan produk memeriksa prefix URL dan keberadaan file, sehingga URL dari owner/cabang/produk lain tidak dapat dipasang.

Migration `20261116060000_limit_product_images_webp.sql` membatasi upload baru menjadi WebP maksimal 204.799 byte. Endpoint juga menegakkan batas format dan ukuran tersebut. Foto lama tetap dapat dibaca dan tidak dikompres ulang otomatis.

Referensi: [Supabase bucket restrictions](https://supabase.com/docs/guides/storage/buckets/creating-buckets), [Storage access policies](https://supabase.com/docs/guides/storage/security/access-control).

`productForPos` meneruskan URL canonical dari kolom produk ke `imageUrl` pada konfigurasi kasir. Reconcile `/api/sync` mempertahankan foto dari admin walaupun perangkat lama mengirim foto usang, termasuk ketika foto sudah dihapus. Mirror tidak menulis kolom `image_url`. Data URI tidak disimpan sebagai foto. Seluruh query daftar tetap batch; tidak ada fetch per foto produk ke database. Browser memuat file gambar secara lazy dari Storage.

Hapus foto mengosongkan kolom dan menghilangkan referensi konfigurasi; file lama tidak dihapus fisik otomatis agar perangkat dengan konfigurasi lama tidak rusak sebelum sync. Upload yang sudah berhasil tetapi form kemudian dibatalkan/gagal dapat meninggalkan file tanpa referensi; pembersihan Storage tidak termasuk tahap ini. Backup JSON/CSV menyimpan URL, bukan file biner; pemindahan lingkungan memerlukan pemindahan file Storage jika URL asal tidak lagi tersedia.

Migration hanya diterapkan ke Supabase lokal saat pengembangan. Tidak memerlukan dependency, package, Next config, atau Vite config baru. Tes meliputi validasi format/path, foto canonical pada sync, fallback ikon POS, serta upload Storage dan simpan/hapus melalui session Auth fixture lokal. Fixture sementara dibersihkan.
