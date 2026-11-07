# Kasir Warung Kopi

Satu repo, satu deploy Vercel, database Supabase.

```
kasir-warung-kopi/
├── app-kasir/         Aplikasi kasir (Vite + React, PWA offline) → disajikan di /kasir/
├── admin-dashboard/   Dashboard owner + API sync (Next.js)       → /, /dashboard, /api/sync
└── supabase/
    └── schema.sql     Skema database (jalankan sekali di Supabase)
```

Saat build, `admin-dashboard` ikut membangun `app-kasir` ke `admin-dashboard/public/kasir/`, jadi
cukup **satu project Vercel**:

| URL                              | Isi                                          |
|----------------------------------|----------------------------------------------|
| `https://<domain>/`              | Halaman pilihan: Kasir / Dashboard           |
| `https://<domain>/kasir/`        | Aplikasi kasir (bisa di-install, jalan offline) |
| `https://<domain>/dashboard`     | Dashboard owner (login Supabase)             |
| `https://<domain>/api/sync`      | Endpoint sync dari kasir ke Supabase         |

## 1. Siapkan Supabase

1. Buat project di [supabase.com](https://supabase.com).
2. **SQL Editor → New query**, tempel isi `supabase/schema.sql`, lalu **Run**.
3. **Authentication → Users → Add user → Create new user**: buat akun owner (email + password,
   centang *Auto Confirm User*). Akun ini dipakai login ke dashboard.
4. **Authentication → Sign In / Providers → matikan "Allow new users to sign up"**. Dashboard
   tidak punya halaman daftar; tanpa langkah ini siapa pun bisa membuat akun lewat API Supabase
   (datanya tetap terpisah karena RLS, tapi memakai kuota database Anda).
5. **Project Settings → API**, catat: Project URL, `anon`/publishable key, dan `service_role` key.

Jika nanti `schema.sql` diperbarui, cukup jalankan ulang seluruh isinya (aman, tidak menghapus data).

## 2. Deploy ke Vercel

1. Push repo ini ke GitHub/GitLab.
2. Vercel → **Add New → Project** → import repo.
3. **Root Directory: `admin-dashboard`** (Framework: Next.js terdeteksi otomatis).
   Biarkan opsi *Include files outside the root directory* aktif (default), karena build
   membutuhkan folder `app-kasir`.
4. **Environment Variables**:

   | Nama                              | Nilai                       |
   |-----------------------------------|-----------------------------|
   | `NEXT_PUBLIC_SUPABASE_URL`        | Project URL                 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY`   | anon / publishable key      |
   | `SUPABASE_SERVICE_ROLE_KEY`       | service_role key (rahasia)  |

5. **Deploy**.

## 3. Hubungkan kasir

1. Buka `https://<domain>/dashboard`, login, buka **Cabang & Token**, buat cabang, salin tokennya.
2. Di tablet/HP kasir buka `https://<domain>/kasir/` lalu *Add to Home Screen*.
3. Login Owner di kasir → **Pengaturan** → *Sinkronisasi ke Dashboard Owner* → tempel token →
   **Tes Sync Sekarang**. URL sync otomatis memakai domain yang sama (kolom URL boleh kosong).

Setelah itu sync berjalan otomatis saat online. Data yang dikirim: transaksi (termasuk
pembatalan & pelunasan bon), pengeluaran, shift 14 hari terakhir, dan katalog produk.
Satu cabang bisa punya beberapa perangkat kasir dengan token yang sama; nomor nota memuat kode
perangkat sehingga tidak bentrok. Jika token bocor, tekan **Ganti** di dashboard.

## Catatan operasional

- **Data di perangkat kasir** disimpan di browser (`localStorage`, ~5 MB). Transaksi yang sudah
  tersinkron dan berumur lebih dari 62 hari otomatis dihapus dari perangkat (data lengkap tetap di
  Supabase/dashboard). Bon yang belum lunas dan transaksi yang belum terkirim tidak pernah dihapus.
  Artinya **sync harus rutin berjalan**; jika perangkat lama offline dan penyimpanan penuh, kasir
  menampilkan pesan agar melakukan sync.
- Jangan "Clear browsing data"/hapus data situs di perangkat kasir sebelum semua data tersinkron.
- Sync dikirim bertahap (200 transaksi per request), jadi aman setelah offline lama.
- **Supabase gratis**: project dijeda jika tidak ada aktivitas 7 hari dan tidak ada backup
  otomatis harian. Untuk usaha sungguhan pertimbangkan paket Pro, atau rutin unduh backup.
- **Beberapa perangkat dalam satu cabang**: transaksi aman (ID memuat kode perangkat), tetapi
  halaman Produk di dashboard mencerminkan katalog dari perangkat yang terakhir sync. Samakan menu
  di semua perangkat (pakai backup/restore JSON di kasir), atau buat cabang terpisah per perangkat.
- PIN kasir bawaan (1234/1111/2222) wajib diganti sebelum dipakai.

## Pengembangan lokal

Butuh Node.js 20+.

```bash
# Dashboard + API (http://localhost:3000)
cd admin-dashboard
cp .env.example .env.local   # isi dengan kredensial Supabase
npm install
npm run dev

# Kasir (http://localhost:3001/kasir/)
cd app-kasir
npm install
npm run dev
npm test
```

Saat kasir dijalankan terpisah di port 3001, isi URL sync di Pengaturan kasir dengan
`http://localhost:3000/api/sync`. Untuk mencoba gabungan seperti di Vercel:
`cd admin-dashboard && npm run build && npm start`, lalu buka `http://localhost:3000/kasir/`.
# kasir-warung-kopi
