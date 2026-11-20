# Setup billing platform

| Lingkungan | Database | Mode billing | Sumber konfigurasi |
| --- | --- | --- | --- |
| `npm run dev` | Supabase Dev atau Supabase lokal | Test | `.env` di root, dengan override `.env.local` |
| Vercel Preview branch `development` | Supabase Dev (`qoqfeoeuzeignsuwnlbv`) | Test | Vercel Environment Variables untuk Preview |
| Vercel Production | Supabase Production (`abxqhjuhleopzstxmvet`) | Live | Vercel Environment Variables untuk Production |

Vercel menamai variabel untuk CLI lokal **Development**. Deployment cloud dari branch `development` memakai **Preview**. Aktifkan system environment variables agar server membaca `VERCEL_ENV`. Aplikasi menentukan mode di server, dan header Super Admin menampilkan mode yang aktif. Atur `PLATFORM_BILLING_TEST_DASHBOARD_URL` di Production ke origin Preview yang stabil. Atur `PLATFORM_BILLING_LIVE_DASHBOARD_URL` di lokal atau Preview bila perlu menentukan origin Live secara eksplisit. Preview memakai domain Production dari Vercel sebagai fallback untuk tautan pindah mode. Perpindahan membuka `/platform` di deployment tujuan, yang memiliki login dan sesi sendiri. [Lingkungan Vercel](https://vercel.com/docs/environment-variables) · [Vercel system variables](https://vercel.com/docs/environment-variables/system-environment-variables)

## Menjalankan lokal

1. Salin `.env.example` di root ke `.env` untuk setup Dev. Untuk memakai Supabase lokal, jalankan `npx supabase start` dan salin URL, publishable key, serta service role key lokal ke `.env.local`. Terapkan migration dengan `npx supabase migration up --local` untuk database lokal yang sudah ada.
2. Pasang dependensi root dan kedua aplikasi, lalu jalankan `npm run dev` dari root. Dashboard memakai `http://localhost:3000/platform` dan kasir memakai `http://localhost:3000/kasir/`. Overview, Kelola Owner, dan trial dapat diuji tanpa tunnel atau akun Xendit.
3. Untuk uji pembayaran, isi `XENDIT_TEST_SECRET_KEY`, `XENDIT_TEST_WEBHOOK_TOKEN`, `XENDIT_TEST_BUSINESS_ID` dan `PLATFORM_BILLING_PUBLIC_URL` di `.env.local`. Pakai origin HTTPS tunnel untuk URL kembali. Arahkan Cloudflare Tunnel ke `http://127.0.0.1:3000` dan publikasikan `/billing/thanks` serta `/api/xendit/subscriptions/webhook`. `DEV_TUNNEL_HOST` hanya diperlukan untuk mengizinkan hostname tunnel pada dev server. Restart aplikasi setelah mengganti env.

Gunakan akun Xendit Test sendiri saat mengarahkan webhook ke komputer lokal. Jika akun Test dipakai bersama, sepakati pengalihan webhook agar event untuk Preview tetap sampai ke database Dev. Pengaturan tunnel, token, dan domain developer disimpan di `.env.local` yang diabaikan Git.

## Rilis ke Vercel

1. Cocokkan project Supabase dan riwayat migration pada target. Siapkan migration platform/billing yang belum masuk, termasuk `20261120120000`, `20261120130000`, `20261120140000`, dan `20261120150000`. Gunakan perintah repo `npm run db:migrate` untuk Dev dan `npm run db:migrate:prod` untuk Production. Migration `20261120130000` memeriksa recurring Live yang belum beres dan menghapus RPC recurring lama. Jika deployment lama masih melayani recurring, tuntaskan atau hentikan alur tersebut sebelum cutover. Siapkan perubahan database dan deployment baru dalam satu jendela rilis karena mengembalikan kode recurring saja tidak mengembalikan RPC yang dihapus.
2. Di Vercel, isi URL Supabase, publishable key, dan service role key dari project target. Di Preview isi tiga variabel `XENDIT_TEST_*` sesuai contoh root. Di Production isi tiga variabel `XENDIT_LIVE_*` untuk master account. Gunakan `PLATFORM_BILLING_PUBLIC_URL` dengan origin dashboard HTTPS yang stabil untuk masing-masing lingkungan. Secret Xendit dan secret Cron tersedia hanya untuk server Next.js.
3. Di Xendit, arahkan **Payment Session Completed** dan **Payment Session Expired** pada mode terkait ke `/api/xendit/subscriptions/webhook` pada origin target. Pastikan Xendit dapat mengakses endpoint, dan pelanggan dapat membuka `/billing/thanks`. Untuk menguji integrasi di Preview yang diproteksi Vercel, siapkan akses yang disetujui untuk kedua kebutuhan tersebut. **Test and save** memeriksa pengiriman callback. Checkout sungguhan di Test Mode memeriksa bahwa payload untuk referensi platform sampai ke database yang tepat. [Deployment Protection](https://vercel.com/docs/deployment-protection)
4. Jika perlu pemeriksaan otomatis tiap 15 menit, isi `BILLING_CRON_SECRET`, simpan URL dashboard `/api/xendit/payments/reconcile` dan secret di Vault database target, lalu jalankan [job SQL](../../supabase/jobs/billing-reconciliation.sql). Cek hasil job dan HTTP `200`. Cron dipasang per database, termasuk bila deployment Vercel dibuat ulang.

Jika aplikasi terdeploy sebelum migration lengkap, layar billing menampilkan pesan kesiapan atau mempertahankan data yang masih dapat dibaca. Checkout dan rekonsiliasi berhenti sebelum memanggil Xendit. Webhook platform yang sah menerima kegagalan sementara supaya dapat dikirim ulang. Akses Owner, layar kasir, dan API sinkronisasi punya jalur terpisah dari pemeriksaan kesiapan billing.

## Batas modul Xendit

- **Langganan KasirKu** memakai master account melalui `lib/platform-billing`. Referensi diawali `pay-test-` atau `pay-live-`. Handler memeriksa token, Business ID master account, serta referensi platform sebelum menulis ke skema `billing`.
- **Business ID** adalah identitas akun Xendit pada field `business_id` di respons [Get Session](https://docs.xendit.co/apidocs/get-session) dan [Payment Session webhook](https://docs.xendit.co/apidocs/webhook-notification-sent-defined-webhook-url-updates-payment-session). Ambil nilainya dari sesi milik master account pada mode yang sesuai dengan deployment.
- **Pembayaran pelanggan kasir** akan menjadi modul tersendiri. Modul itu memiliki referensi, webhook, data transaksi, dan pemetaan tenant ke sub-account sendiri. Transport `lib/xendit/client.ts` dapat dipakai bersama. Identitas sub-account untuk operasi kasir seperti `for-user-id` diatur di adapter kasir saat modul tersebut dibuat. [Xendit sub-account payments](https://docs.xendit.co/docs/accepting-payments-for-sub-accounts)
