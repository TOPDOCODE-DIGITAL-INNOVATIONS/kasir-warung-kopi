# Dashboard Owner + API Sync

Bagian Next.js dari monorepo Kasir Warung Kopi. Lihat `../README.md` untuk panduan deploy.

- `src/app/dashboard/*` – halaman dashboard (data dibaca lewat RLS Supabase per owner)
- `src/app/api/sync/route.ts` – menerima data dari `app-kasir`, divalidasi dengan token cabang,
  ditulis ke Supabase memakai service role key
- `src/proxy.ts` – refresh sesi Supabase, proteksi `/dashboard`
- `/kasir/` dilayani service `app-kasir` (lihat `../vercel.json`), bukan oleh Next.js

Role akun platform (`owner`/`super_admin`) berada di app_metadata. Kelola User
mengatur profil kasir di pos_config, termasuk penambahan profil dengan PIN, dan
tidak membuat akun Auth baru. Panel pengelolaan Owner dan pembatasan operasional
berdasarkan status akun belum diterapkan. Lihat
[Akun platform dan profil kasir](../docs/platform-accounts.md) untuk migration,
bootstrap super admin dan batas rollout data production.
