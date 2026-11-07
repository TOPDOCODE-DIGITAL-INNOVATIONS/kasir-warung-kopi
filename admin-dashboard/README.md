# Dashboard Owner + API Sync

Bagian Next.js dari monorepo Kasir Warung Kopi. Lihat `../README.md` untuk panduan deploy.

- `src/app/dashboard/*` – halaman dashboard (data dibaca lewat RLS Supabase per owner)
- `src/app/api/sync/route.ts` – menerima data dari `app-kasir`, divalidasi dengan token cabang,
  ditulis ke Supabase memakai service role key
- `src/proxy.ts` – refresh sesi Supabase, proteksi `/dashboard`, redirect `/kasir` → `/kasir/`
- `npm run build` juga membangun `../app-kasir` ke `public/kasir/`
