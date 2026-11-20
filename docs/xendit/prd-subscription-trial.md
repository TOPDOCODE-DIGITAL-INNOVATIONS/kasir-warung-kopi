# PRD Subscription dan Free Trial KasirKu

- **Status** · Draf untuk persetujuan produk
- **Tanggal** · 20 November 2026
- **Cakupan fase pertama** · Pengelolaan langganan dan trial oleh Super Admin Platform dengan Xendit untuk pasar Indonesia

## 1. Tujuan dan cakupan

Setiap Owner mendapat satu cabang gratis. Super Admin mengelola trial, harga, checkout, dan riwayat pembayaran melalui **Subscription & Trial**. Owner dapat membuat checkout bulanan atau tahunan untuk akunnya melalui **Langganan & Pembayaran** di dashboard Owner.

| Tahap | Pembayar | Yang dibayar | Penerima dana |
|---|---|---|---|
| Langganan KasirKu · fase pertama | Owner | Paket cabang tambahan KasirKu | Akun Xendit platform KasirKu |
| Pembayaran di kasir · tahap berikutnya | Pelanggan outlet | Barang atau layanan yang dibeli di kasir | Saldo sub-account merchant di Xendit, lalu rekening merchant melalui payout |

Di dashboard Owner, kedua halaman dapat dibuka dari menu akun atau modal saat memulai penambahan cabang kedua dan berikutnya. Tombol **OK** membuka form tambah cabang. Pembatasan operasional akibat trial atau langganan habis menjadi fase berikutnya. Onboarding merchant, verifikasi bisnis, pembayaran pelanggan di POS, split fee, payout, dan rekonsiliasi penjualan merchant masuk PRD tersendiri.

## 2. Kondisi aplikasi saat ini

- Owner mendaftar dan masuk dengan Supabase Auth. Cabang terhubung ke akun melalui `businesses.owner_id`. Super Admin punya area `/platform` sendiri. Role platform dan status administrasi akun tersimpan di `app_metadata`. Status administrasi Owner saat ini tidak membatasi operasional.
- Aplikasi kasir mendukung transaksi offline serta memakai token cabang untuk `/api/sync`. Hubungan antara status tagihan, akses dashboard, dan izin perangkat dibahas saat implementasi menjangkau aplikasi operasional.
- Production sudah memiliki akun, cabang, dan histori penjualan. Fase pertama memasang model billing secara aditif. Waktu transisi serta pemulihan data offline menjadi bagian perencanaan saat pembatasan akses mulai diterapkan.

Rujukan repo · [Akun platform dan profil kasir](../platform-accounts.md) · [API sinkronisasi](../../admin-dashboard/src/app/api/sync/route.ts) · [Penyimpanan lokal kasir](../../app-kasir/src/lib/storage.ts)

## 3. Kebijakan produk

| Topik | Usulan untuk fase pertama | Keputusan |
|---|---|---|
| Unit langganan | Cabang pertama gratis. Satu paket cabang tambahan berlaku per akun Owner. | Jumlah cabang diambil dari `businesses.owner_id`. Pembuatan cabang tetap tersedia saat paket belum dibayar. |
| Paket | Bulanan dan tahunan dalam IDR. Setiap periode dibayar melalui checkout satu kali. | Gunakan harga paket yang dikelola Super Admin. Harga tidak dikalikan jumlah cabang pada fase ini. |
| Trial | Super Admin memulai trial 14 hari untuk Owner dengan email terverifikasi. Trial dicatat sekali per Owner per lingkungan, tanpa metode bayar. | Durasi 14 hari digunakan untuk uji lokal. Konfirmasi kebijakan sebelum rollout live. |
| Konversi | Super Admin menyiapkan paket yang dipilih Owner. Jika pembayaran sukses saat trial berjalan, akhir trial dan awal periode berbayar mengikuti kebijakan yang dikomunikasikan saat checkout. | Usulan awal mengenakan biaya saat checkout dan mengakhiri trial saat periode berbayar dimulai. |
| Pembayaran gagal atau batal | Checkout dapat diperiksa ulang. Owner dapat memakai tautan baru setelah sesi sebelumnya ditutup. Periode berbayar tetap berlaku hingga tanggal akhirnya. | Kebijakan refund dibahas terpisah. |
| Perubahan paket | Masa akses dari paket baru ditambahkan setelah akhir periode aktif. Pembayaran prorata menjadi tahap lanjutan. | Setujui aturan perpindahan serta perubahan harga untuk pelanggan lama. |

Status langganan dan periode berbayar disimpan di modul billing. `account_status` tetap menjadi status administrasi akun. Pembayaran sukses memperbarui status dan periode billing yang ditampilkan di Super Admin.

## 4. Alur pengguna dan layar

| Bagian | Kebutuhan |
|---|---|
| **Daftar Subscription & Trial** | Cari menurut Owner, email, atau status. Tampilkan jumlah cabang, cakupan gratis atau paket tambahan, akhir trial, periode berbayar, dan tanggal perpanjangan. |
| **Detail trial dan langganan** | Tampilkan trial, jumlah cabang, cakupan paket, dan riwayat pembayaran beserta nominal, status, tanggal bayar, periode yang dibayar, dan referensinya. |
| **Operasi pembayaran** | Salin tautan checkout dari Xendit untuk disampaikan kepada Owner. Sediakan pengecekan ulang status sesi dari platform. Catat pelaku, waktu, dan hasil tindakan. |
| **Hosted checkout Xendit** | Owner meninjau nominal paket dan menyelesaikan pembayaran satu kali di halaman Xendit. Status pembayaran diverifikasi oleh server. |

### Alur utama

1. **Trial.** Super Admin memilih Owner yang memenuhi syarat dan memulai trial. Server mencatat awal, akhir, dan penggunaan trial dalam satu mutasi yang aman terhadap klik ulang. Trial berakhir pada waktu yang dicatat dan tidak menimbulkan tagihan otomatis.
2. **Pembayaran pertama.** Owner dapat memilih dan membayar paket cabang tambahan sebelum atau sesudah cabang kedua dibuat. Super Admin juga bisa menyiapkan tautan. Periode berbayar dicatat setelah server memverifikasi pembayaran serta kecocokan akun, paket, dan nominal.
3. **Perpanjangan.** Owner atau Super Admin membuat checkout baru. Pembayaran sebelum periode berakhir menambahkan durasi paket setelah akhir periode aktif. Pembayaran setelah periode habis memulai periode baru pada waktu pembayaran.
4. **Pemulihan.** Super Admin memeriksa sesi yang belum terkonfirmasi atau membatalkannya. Checkout kedaluwarsa atau batal dapat diganti dengan tautan baru setelah Xendit mengonfirmasi statusnya.

### Status yang ditampilkan

| Status | Arti di Super Admin |
|---|---|
| Belum mulai | Belum ada trial atau periode berbayar yang tercatat. |
| Trial aktif | Trial sedang berjalan sampai tanggal yang tercatat. |
| Menunggu pembayaran | Checkout sudah dibuat atau metode bayar sedang diverifikasi. |
| Berlangganan | Pembayaran terverifikasi dan periode berbayar masih berlaku. |
| Perlu pembayaran | Pembayaran yang perlu tindak lanjut. |
| Periode habis | Trial atau periode berbayar sudah lewat. Fase pertama menampilkan status ini di platform. |

Status checkout, pembayaran, dan periode akses dicatat terpisah. URL kembali setelah checkout menampilkan progres verifikasi. Status akses ditetapkan oleh backend.

## 5. Integrasi Xendit

### Pengaturan dan kontrak pembayaran

- Gunakan **Payment Sessions** `POST /sessions` dengan tipe `PAY`, mode `PAYMENT_LINK`, dan penangkapan pembayaran otomatis. Xendit menyediakan kanal pembayaran sesuai pengaturan akun platform. [Create a session](https://docs.xendit.co/apidocs/create-session)
- Backend KasirKu menambahkan satu atau dua belas bulan berdasarkan versi paket saat checkout. Simpan dan tampilkan histori pembayaran serta periode akses yang dihasilkan.
- Sesi Xendit dapat dibaca ulang untuk rekonsiliasi dan dibatalkan selama statusnya memungkinkan. [Get session](https://docs.xendit.co/apidocs/get-session) · [Cancel a session](https://docs.xendit.co/apidocs/cancel-session)

### Struktur kode yang direncanakan

| Lokasi | Tanggung jawab |
|---|---|
| `admin-dashboard/src/app/platform/subscriptions/` | Halaman serta aksi Super Admin untuk trial dan langganan. Aksi memeriksa role dan memanggil modul server. |
| `admin-dashboard/src/lib/xendit/client.ts` | Transport HTTP server-only untuk autentikasi API, timeout, dan pemetaan error Xendit. |
| `admin-dashboard/src/lib/platform-billing/` | Konfigurasi deployment dan akun, checkout langganan, parsing webhook, dan rekonsiliasi. |
| `admin-dashboard/src/app/api/xendit/subscriptions/` | Endpoint Payment Sessions untuk billing KasirKu, termasuk `webhook/route.ts`. Handler meneruskan proses ke modul server di atas. |

Panggilan HTTP ke Xendit dipusatkan di modul integrasi. Aturan trial dan status billing berada di domain billing. Dari log, operator dapat menelusuri satu upaya checkout hingga webhook atau rekonsiliasi lewat ID korelasi, referensi internal, ID sesi/plan/siklus provider, lingkungan test/live, dan kode hasil. Log menyamarkan secret, token, serta data pembayaran sensitif. Integrasi pembayaran pelanggan di masa depan memiliki namespace Xendit tersendiri untuk POS.

### Webhook dan rekonsiliasi

1. Endpoint server memverifikasi `x-callback-token`, asal lingkungan test/live, dan akun Xendit yang diharapkan. Secret key dan token webhook disimpan di environment server. Nomor kartu dan CVV diproses pada kanal pembayaran Xendit. [Panduan webhook Xendit](https://docs.xendit.co/docs/handling-webhooks)
2. Terima `payment_session.completed` dan `payment_session.expired` melalui endpoint yang sudah digunakan. Cocokkan lingkungan, referensi, ID sesi, nominal, dan mata uang. Penyelesaian checkout `PAY` dengan ID pembayaran yang terverifikasi menerapkan periode secara atomik. [Payment Session Webhook](https://docs.xendit.co/apidocs/webhook-notification-sent-defined-webhook-url-updates-payment-session)
3. Pembayaran diterapkan sekali per sesi dan ID pembayaran. Status batal atau kedaluwarsa yang datang setelah pembayaran tidak mengurangi periode.
4. Pertahankan satu checkout terbuka per Owner dan lingkungan. Percobaan pembuatan ulang memakai referensi checkout yang sama jika statusnya masih belum terkonfirmasi.
5. **Pemantauan Pembayaran** menampilkan checkout tertunda dan webhook yang perlu ditinjau sesuai lingkungan deployment di header Super Admin. Super Admin dapat memeriksa ulang checkout yang sudah memiliki ID sesi Xendit. Checkout yang belum memiliki ID sesi dapat dilanjutkan dari detail langganan dengan referensi yang sama.
6. Supabase Cron meminta rekonsiliasi setiap 15 menit. Server mengambil hingga 10 checkout tertunda dengan ID sesi dari lingkungan deployment. Pembayaran yang dikonfirmasi melalui API Xendit diterapkan melalui fungsi yang sama dengan webhook. Webhook yang sebelumnya perlu ditinjau dapat diselesaikan otomatis jika hasil pemeriksaan mengonfirmasi data yang cocok. Selisih nominal, mata uang, atau identitas pembayaran tetap terlihat untuk ditinjau.

#### Mengaktifkan rekonsiliasi berkala

1. Set `BILLING_CRON_SECRET` di environment server dashboard. Gunakan nilai acak yang berbeda untuk setiap deployment.
2. Pada Supabase Vault untuk deployment tersebut, simpan URL lengkap `https://<domain-dashboard>/api/xendit/payments/reconcile` dengan nama `kasirku_billing_reconcile_url`, serta nilai yang sama dengan `BILLING_CRON_SECRET` dengan nama `kasirku_billing_reconcile_secret`. URL harus dapat dijangkau dari Supabase dan mengarah ke dashboard yang menggunakan database tersebut. Job mengirim `POST` dengan `Authorization: Bearer …`.
3. Jalankan [billing-reconciliation.sql](../../supabase/jobs/billing-reconciliation.sql) di SQL Editor. Periksa jadwal di Supabase Cron dan respons HTTP di `net._http_response`. Respons `200` berarti server menerima job. Body memuat jumlah yang diperiksa, diterapkan, dan perlu ditinjau per lingkungan.

[Checklist lingkungan dan rilis](platform-billing-setup.md) · [Supabase Cron](https://supabase.com/docs/guides/cron/quickstart) · [Supabase Vault](https://supabase.com/docs/guides/database/vault) · [pg_net](https://supabase.com/docs/guides/database/extensions/pg_net)

## 6. Batas fase pertama dan persiapan fase operasional

- Hanya Super Admin aktif yang mengakses halaman dan aksi pengelolaan Subscription & Trial. Pembaruan dari Xendit diproses oleh webhook yang terverifikasi atau rekonsiliasi server.
- Di fase pertama, status billing berlaku untuk administrasi platform. Dashboard Owner, aplikasi kasir, `/api/sync`, dan aturan transaksi offline tetap memakai alur operasional saat ini. Akses Owner production dipertahankan saat fase pertama dirilis.

Fase operasional berikutnya dapat mencakup self-service di dashboard Owner, pemberitahuan kepada Owner atau kasir, dan pembatasan penjualan baru setelah akses habis. PRD fase itu perlu menetapkan periode transisi pengguna lama, izin offline berbatas waktu, penyelesaian shift, dan cara memasukkan antrean transaksi yang sudah dibuat. Uji kondisi koneksi putus dan perubahan jam perangkat sebelum menerapkan pembatasan.

## 7. Model data dan tampilan tinjauan

Halaman tinjauan tersedia di **Super Admin → Subscription & Trial** (`/platform/subscriptions`). Daftar menampilkan Owner yang sudah terdaftar, status dan akhir trial, status langganan, paket, periode berbayar, serta tanggal perpanjangan. Klik nama Owner untuk melihat waktu mulai/akhir trial, informasi perpanjangan, serta masing-masing 25 riwayat siklus dan checkout terbaru. Header Super Admin menunjukkan lingkungan deployment dan menyediakan tautan untuk berpindah deployment bila URL tujuan dikonfigurasi.

Harga paket Bulanan dan Tahunan dikelola oleh Super Admin. Nominal yang sudah tercatat pada checkout tetap berlaku setelah perubahan harga. Owner tanpa data billing tampil sebagai belum mulai. Super Admin dapat memakai **Mulai Trial** di detail Owner. [Migration trial](../../supabase/migrations/20261118150000_platform_start_trial.sql) menyimpan awal, akhir, pelaku, dan audit secara atomik. Pembuatan checkout dan penerimaan webhook mengikuti validasi Xendit Test Mode.

Model dipasang melalui migration aditif [Platform Billing Preview](../../supabase/migrations/20261118140000_platform_billing_preview.sql) di schema privat `billing`. Relasi Owner memakai foreign key ke `auth.users(id)`. Satu akun billing per pasangan Owner dan lingkungan menjaga trial serta ID customer test terpisah dari live. Jika desain lanjutan memerlukan perubahan tabel lama, dokumentasikan alasannya, dampak terhadap data yang sudah berjalan, dan prosedur pemulihannya sebelum menambah migration baru.

| Data | Isi inti |
|---|---|
| `billing_plans` | Kode dan versi paket, harga IDR, interval, status penawaran. Harga yang ditampilkan dan disetujui dicatat pada checkout. |
| `billing_accounts` | Satu baris per Owner per lingkungan, ID customer Xendit, awal dan akhir trial, serta Super Admin yang memulai trial. |
| `billing_subscriptions` | Owner, versi paket, status, dan periode berbayar yang terverifikasi. |
| `billing_checkout_sessions` | Percobaan checkout, referensi unik, paket dan harga yang disetujui, ID sesi provider, status penyelesaian, waktu kedaluwarsa, dan mode pembayaran. |
| `billing_cycles` | Riwayat pembayaran dan periode yang dicakup, nominal, status, referensi pembayaran, dan waktu dibayar. |
| `billing_webhook_events` | Referensi event, sumber, kunci dedup, status pemrosesan, percobaan, dan alasan jika perlu ditinjau. Terapkan kebijakan retensi atas data webhook. |
| `billing_audit_events` | Tindakan pengelolaan trial, checkout, penghentian perpanjangan, dan rekonsiliasi dengan identitas Super Admin, waktu, serta hasil. |

Daftar dan detail memakai dua fungsi baca dengan akses server `service_role`. Fungsi memeriksa role Super Admin aktif, memisahkan lingkungan data dan membatasi jumlah baris. Model menyimpan maksimal satu langganan berjalan dan satu checkout terbuka per Owner per lingkungan. Penerapan pembayaran dan pembaruan periode billing secara atomik menjadi bagian tahap integrasi. Pengujian migration memakai data di luar production untuk memeriksa akun, cabang, transaksi, dan relasi lama. Pembayaran penjualan POS, sub-account merchant, dan payout memiliki pencatatan tersendiri pada tahap berikutnya.

## 8. Rilis dan kriteria penerimaan

1. **Validasi Xendit Test Mode.** Uji pembayaran satu kali untuk pilihan bulanan dan tahunan, termasuk selesai, batal, dan kedaluwarsa.
2. **Validasi periode.** Uji pembayaran awal, perpanjangan sebelum dan sesudah periode habis, serta pengiriman ulang webhook.
3. **Pilot dari Super Admin.** Validasi nominal, riwayat, dan jalur rekonsiliasi.

Gunakan secret key **Test Mode** dari environment server. [API keys](https://docs.xendit.co/docs/api-keys)

- [ ] Super Admin aktif dapat memulai trial sekali untuk Owner yang memenuhi syarat. Trial berakhir pada waktu server yang benar dan tidak menimbulkan tagihan.
- [ ] Super Admin dapat menyiapkan checkout bulanan atau tahunan. Pembayaran pertama dan perpanjangan menagih nominal yang disetujui dan mencatat periode yang sesuai. Mengulang klik atau mengirim ulang webhook tidak menambah tagihan maupun periode.
- [ ] Callback dengan token salah, nominal tidak cocok, atau referensi yang tidak sesuai tidak mengubah status pembayaran. Status lunas ditetapkan setelah bukti pembayaran terverifikasi.
- [ ] Event terlambat, duplikat, terbalik urutannya, dan timeout provider berhasil diuji. Ketidaksesuaian dapat ditemukan melalui rekonsiliasi tanpa menagih ulang secara otomatis.
- [ ] Super Admin aktif dapat melihat dan menindaklanjuti pembayaran dengan jejak audit. Owner, kasir, dan endpoint sinkronisasi mengikuti alur akses yang sudah berjalan saat trial atau periode billing habis.
- [ ] Migration baru dapat diterapkan dengan data lama tanpa mengubah histori penjualan dan kepemilikan cabang. Panggilan Xendit dan webhook dapat ditelusuri dari satu referensi checkout di log.

Pantau konversi trial ke pembayaran pertama, keberhasilan perpanjangan, tagihan tertunda, dan selisih rekonsiliasi. Tetapkan ambang peringatan setelah pilot.

## 9. Arah tahap berikutnya · Pembayaran pelanggan di POS

Alur produk yang ingin dicapai adalah **Pelanggan → Aplikasi Kasir → pembayaran Xendit untuk sub-account merchant → saldo merchant → payout ke rekening merchant**. Unjuk kerja pembayaran POS harus diuji terpisah dari langganan. XenPlatform menyediakan pengelolaan sub-account dan perutean pembayaran. Pemilihan antara pemrosesan langsung menggunakan konteks sub-account dan split ke akun tujuan bergantung pada pengaturan merchant dan biaya platform. [XenPlatform Overview](https://docs.xendit.co/docs/xenplatform-overview) · [Route & split payments](https://docs.xendit.co/docs/split-payments)

PRD lanjutan perlu menetapkan unit sub-account (merchant atau cabang), onboarding dan KYC, pemilik rekening serta otorisasi payout, settlement, fee dan split, refund/dispute, metode pembayaran, dan rekonsiliasi per cabang. Konfirmasi versi XenPlatform serta ketersediaan produknya untuk akun dan negara target sebelum menentukan alur perutean. [Sub-accounts](https://docs.xendit.co/docs/sub-accounts) · [Payouts for sub-accounts](https://docs.xendit.co/docs/payouts-for-sub-accounts) · [XenPlatform V3 API Migration Guide](https://docs.xendit.co/docs/xenplatform-v3-api-migration-guide)

## 10. Keputusan sebelum implementasi

1. Setujui harga bulanan/tahunan, perlakuan pajak, durasi trial, dan kriteria kelayakan.
2. Setujui siapa yang boleh memulai trial dan menyiapkan checkout, waktu tagihan pertama, cara menyampaikan tautan, dan kebijakan pembatalan/refund.
3. Konfirmasi kanal pembayaran, versi API, dan otorisasi akun Xendit platform pada Test Mode sebelum mengaktifkan tagihan live.
4. Bahas periode transisi, kuota cabang/perangkat, toleransi akses, dan izin offline saat menyusun fase dashboard Owner dan kasir.
