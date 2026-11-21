# Kasir Warung Kopi

Satu repo, satu deploy Vercel, database Supabase.

```
kasir-warung-kopi/
├── app-kasir/         Aplikasi kasir (Vite + React, PWA offline) → disajikan di /kasir/
├── admin-dashboard/   Dashboard owner + API sync (Next.js)       → /, /dashboard, /api/sync
├── supabase/
│   ├── migrations/    Perubahan database berurutan
│   └── schema.sql     Referensi skema lama
└── vercel.json        Konfigurasi Vercel Services (2 service, 1 domain)
```

Repo ini dideploy sebagai **satu project Vercel dengan 2 service**
([Vercel Services](https://vercel.com/docs/services)). Masing-masing di-build terpisah, lalu
`vercel.json` mengarahkan URL ke service yang tepat:

| URL                              | Isi                                          |
|----------------------------------|----------------------------------------------|
| `https://<domain>/`              | Halaman pilihan: Kasir / Dashboard           |
| `https://<domain>/kasir/`        | Aplikasi kasir (bisa di-install, jalan offline) |
| `https://<domain>/dashboard`     | Dashboard owner (login Supabase)             |
| `https://<domain>/api/sync`      | Endpoint sync dari kasir ke Supabase         |

## 1. Siapkan Supabase

1. Buat project di [supabase.com](https://supabase.com).
2. Gunakan migration berurutan di `supabase/migrations` untuk menyiapkan database.
   Untuk database yang sudah berisi data, cocokkan riwayat target terlebih dahulu;
   jangan menjalankan reset atau mengulang baseline.
3. Buat akun Owner melalui tautan **Daftar** pada halaman login, lalu konfirmasi email.
   Akun juga dapat dibuat melalui **Authentication → Users** oleh pengelola.
4. **Authentication → Sign In / Providers → aktifkan "Allow new users to sign up"**
   jika pendaftaran mandiri diperlukan. Role Owner diinisialisasi di app_metadata;
   pengguna tidak memilih role platform saat registrasi.
5. **Project Settings → API**, catat: Project URL, `anon`/publishable key, dan `service_role` key.

`schema.sql` adalah referensi skema lama; perubahan berikutnya menggunakan migration
baru. Rancangan role, batas fitur dan prosedur rollout ada di
[Akun platform dan profil kasir](docs/platform-accounts.md).

### Database dev & prod

| File        | Database | Dipakai oleh                                              |
|-------------|----------|-----------------------------------------------------------|
| `.env`      | DEV      | `npm run dev` (dashboard & kasir), `npm run db:status/migrate/test` |
| `.env.prod` | PROD     | hanya `npm run db:status:prod` / `npm run db:migrate:prod` |

Alur rilis: `npm run db:migrate` + `npm run db:test` di dev → merge ke `main` →
`npm run db:migrate:prod` (minta konfirmasi ref project) → deploy. SQL tests tidak
dijalankan di prod. Aplikasi production di Vercel memakai env dari Vercel, bukan file di atas.

## 2. Deploy ke Vercel

1. Push repo ini ke GitHub/GitLab.
2. Vercel → **Add New → Project** → import repo.
3. **Root Directory: biarkan kosong (root repo)**. Vercel membaca `vercel.json` dan mendeteksi
   2 service: `admin-dashboard` (Next.js) dan `app-kasir` (Vite).
4. **Environment Variables**:

   | Nama                              | Nilai                       |
   |-----------------------------------|-----------------------------|
   | `NEXT_PUBLIC_SUPABASE_URL`        | Project URL                 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY`   | anon / publishable key      |
   | `SUPABASE_SERVICE_ROLE_KEY`       | service_role key (rahasia)  |

5. **Deploy**.

## 3. Hubungkan kasir

1. Buka `https://<domain>/dashboard`, login, buka **Cabang & Token**, buat cabang.
2. Di tablet/HP kasir buka `https://<domain>/kasir/` lalu *Add to Home Screen*.
3. Kasir yang belum terhubung selalu menampilkan layar **Hubungkan ke Cabang**:
   - **Akun Owner**: masuk dengan email + password (atau **Masuk dengan Google**), lalu pilih cabang.
     Hanya cabang milik akun tersebut yang tampil.
   - **Token Cabang**: tempel token dari Cabang & Token, atau buka *Link Kasir* dari dashboard.
4. **Data kasir selalu bersumber dari server per cabang.** Cabang yang sudah punya data: menu,
   kasir, dan pengaturan ditarik dari server dan menimpa data di perangkat. Cabang baru: siapkan
   user pertama (Owner) dari Dashboard → Kelola User, atau buat nama + PIN Owner di kasir. Perangkat
   tidak pernah mengunggah menu/karyawannya ke cabang kosong secara otomatis; kasir menampilkan
   layar **Siapkan Cabang** (Mulai kosong / Kirim data perangkat ini, wajib PIN Owner).
5. Nama cabang tampil di navbar kasir (**Cabang: …**).
6. **Keluar dari Cabang** ada di Pengaturan kasir (khusus Owner, wajib PIN). Logout ditolak bila
   shift masih terbuka atau ada data yang belum terkirim. Setelah logout, data cabang di perangkat
   dihapus (data di server tetap aman) dan kasir kembali ke layar Hubungkan.

Setelah itu sync berjalan otomatis saat online. Data yang dikirim: transaksi (termasuk
pembatalan & pelunasan bon), pengeluaran, shift 14 hari terakhir, dan katalog produk.
Satu cabang bisa punya beberapa perangkat kasir dengan token yang sama; nomor nota memuat kode
perangkat sehingga tidak bentrok. Jika token bocor, tekan **Ganti** di dashboard.

## Langganan, trial, dan login

- **Saklar `BILLING_ENABLED`** (default mati). Tanpa `BILLING_ENABLED=true` tidak ada trial, dashboard
  tidak pernah hanya-baca, dan kasir tidak pernah dibatasi. Nyalakan setelah Xendit Live siap.
- Saat saklar menyala, **trial otomatis 14 hari** dimulai saat Owner pertama kali membuka dashboard atau kasirnya sync
  (email harus terverifikasi). Owner lama juga otomatis mendapat trial 14 hari sejak rilis ini.
- Owner berlangganan sendiri di **Dashboard → Langganan** (checkout Xendit; `BILLING_ENVIRONMENT`
  memilih `test`/`live`). Satu langganan untuk semua cabang.
- Setelah trial/periode berakhir ada **toleransi 3 hari**. Lewat dari itu dashboard **hanya-baca**
  (laporan & backup tetap bisa) dan kasir **tidak bisa membuat transaksi baru**. Transaksi yang sudah
  ada tetap diterima `/api/sync`. Aturannya ada di `shared/billing-access.ts`.
- **Lupa password** (`/forgot-password`) dan **login Google** memakai Supabase Auth. Di Supabase →
  Authentication → URL Configuration, tambahkan `https://<domain>/auth/confirm` (dan
  `http://localhost:3000/auth/confirm` untuk dev) ke *Redirect URLs*. Aktifkan provider Google di
  Authentication → Providers dengan Client ID/Secret dari Google Cloud Console.
- Halaman publik: `/` (landing + harga), `/terms`, `/privacy`. Isi `NEXT_PUBLIC_COMPANY_*` dan
  `NEXT_PUBLIC_SUPPORT_*` (lihat `.env.example`) sebelum rilis.

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

Butuh Node.js 20+. Cara paling mirip produksi (semua service sekaligus, satu port):

```bash
npx vercel dev -L    # http://localhost:3000 → /, /dashboard, /kasir/, /api/sync
```

Atau jalankan per aplikasi:

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

# Test dashboard
cd admin-dashboard && node --test tests/*.test.mjs
```

Saat kasir dijalankan terpisah di port 3001, isi URL sync di Pengaturan kasir dengan
`http://localhost:3000/api/sync`.
# kasir-warung-kopi
