# Akun platform dan profil kasir

## Keputusan dan perubahan dari rancangan sebelumnya

Sebelumnya, registrasi menulis `user_metadata.role = 'Owner'`, menu akun selalu
menampilkan Owner, dan dashboard memeriksa login serta `businesses.owner_id`.
Role tersebut hanya label deskriptif. Profil kasir tetap merupakan data tersendiri.

Sekarang akun Supabase Auth menggunakan:

```json
{
  "platform_role": "owner",
  "account_status": "active"
}
```

Kedua properti ini berada dalam **app_metadata**, bukan user_metadata. Role yang
diterima adalah `owner` dan `super_admin`; status adalah `active` dan `inactive`.
Nama tetap di user_metadata. `provider`, `providers`, dan properti lain yang sudah
tersedia tetap dipertahankan. Jangan mengubah kolom Auth `role` (`authenticated`):
role PostgreSQL tersebut berbeda dari role platform aplikasi.

Registrasi hanya mengirim nama di user_metadata; role/status default berasal dari
database. Role dari user_metadata tidak pernah dipakai untuk izin akses. Metadata
role lama dibiarkan tersimpan agar perubahan ini tidak menghapus atribut akun lama.
Jika field terpercaya belum tersedia saat rollout, aplikasi memperlakukan akun
sebagai Owner aktif demi kompatibilitas. Nilai eksplisit yang tidak dikenal ditolak.

`getBusinessContext` membaca role dari hasil `auth.getUser()` dan tetap membatasi
semua data bisnis ke pemiliknya. Menu akun menampilkan role yang sebenarnya.
`requireSuperAdmin()` adalah helper server-only untuk area platform mendatang:
helper memeriksa akun terbaru melalui Auth, menolak Owner, pengguna tanpa login,
dan super admin berstatus inactive. Pemeriksaan tidak hanya menggunakan role JWT
lama. Helper ini belum membuka endpoint atau halaman pengelolaan platform.

## Yang ditunda

- Halaman/list pengelolaan akun Owner dan pengelolaan super admin lain.
- Aksi aktivasi/nonaktivasi akun melalui dashboard.
- Pemblokiran akses dashboard Owner, operasional cabang, aplikasi kasir, dan API
  sinkronisasi berdasarkan account_status. Status Owner saat ini hanya persiapan.
- Subscription, trial, dan akses transaksi/data bisnis lintas Owner oleh super admin.

Tidak ada perubahan pada RLS kepemilikan, token cabang, mode offline, alur transaksi,
atau pengurangan stok. Menjadi super admin tidak memberikan bypass RLS. Akun
super admin yang belum memiliki cabang mendapat kondisi dashboard tanpa cabang;
belum ada menu platform baru, sesuai keputusan penundaan rancangan tampilannya.

## Migration dan keamanan data lama

Migration baru: `20261116080000_platform_account_roles.sql`. Tidak ada migration lama
yang diedit, tabel/kolom bisnis baru, atau tabel master user kedua.

- Backfill hanya akun dengan platform_role/account_status yang belum ada atau null.
- Role/status terpercaya yang sudah ada tidak ditimpa. Role dari user_metadata
  tidak disalin ke app_metadata, termasuk jika nilainya super_admin.
- Trigger BEFORE INSERT pada auth.users mengisi default akun baru; function
  security invoker tidak membutuhkan secret key di aplikasi/browser.
- Function berada di schema private dan tidak dapat dipanggil anon/authenticated.
- ID akun, password, profil, email konfirmasi, session, kepemilikan, data bisnis,
  dan konfigurasi kasir tidak direset atau dihapus.
- Migration dapat dijalankan kembali tanpa mengganti metadata yang sudah terisi.

Untuk production, bandingkan riwayat migration database target dengan seluruh file
migration yang **sudah ada di target** terlebih dahulu. Terapkan migration baru ini
sebelum atau bersamaan dengan deployment aplikasi. Jangan menggunakan `db reset`,
menjalankan ulang schema.sql, atau memperbaiki riwayat migration secara paksa.
Tidak ada script dalam fitur ini yang otomatis menerapkan migration ke remote.

Pengujian lokal menggunakan riwayat migration dari main dan dua migration foto
yang sudah diterapkan dari ngr, melalui direktori sementara yang diabaikan Git.
Kedua migration foto tersebut tidak ditambahkan ulang ke main dalam perubahan ini.
Saat menyiapkan deployment, pastikan riwayat target sesuai branch yang digunakan.

Jika perlu membatalkan deployment aplikasi, metadata tambahan dapat tetap tinggal
karena kode lama tidak memakainya. Evaluasi penonaktifan trigger secara terpisah;
jangan menghapus akun atau metadata lain untuk rollback.

## Super admin pertama

Skrip operator `scripts/bootstrap-super-admin.mjs` hanya mempromosikan akun Auth
yang sudah terdaftar dan emailnya terkonfirmasi. Skrip tidak membuat password,
menghapus akun, menurunkan role, atau mengubah status inactive menjadi active.
Defaultnya pratinjau; mode penerapan meminta host target yang eksplisit.

Jalankan dari root repo dengan Node yang mendukung `--env-file`:

```powershell
# Pratinjau; tidak ada perubahan akun.
node --env-file=.env scripts/bootstrap-super-admin.mjs --email admin@example.com

# Terapkan hanya ke Supabase lokal.
node --env-file=.env scripts/bootstrap-super-admin.mjs --email admin@example.com --apply --confirm-project 127.0.0.1:54321
```

Environment server memerlukan NEXT_PUBLIC_SUPABASE_URL dan
SUPABASE_SERVICE_ROLE_KEY. Gunakan secret/service-role key, tanpa fallback ke
publishable/anon. Skrip tidak mencetak password, secret key, atau token sesi.
Untuk target lain, operator harus menyediakan environment target dan host yang
sesuai; tidak ada email/password production yang ditanam di migration atau seeder.

Perubahan app_metadata tidak langsung memperbarui JWT lama. Masuk ulang atau
refresh sesi untuk memperoleh claim baru. Tampilan akun dan helper izin platform
menggunakan data Auth terbaru. Proteksi super admin terakhir harus ditambahkan
ketika aksi demosi/nonaktivasi super admin dibuat; aksi tersebut belum tersedia.

## Tambah profil kasir dari admin dashboard

Halaman Kelola User sekarang menyediakan Tambah User: nama, role kasir
(Kasir/Supervisor/Owner), warna avatar, PIN 4–6 angka, dan konfirmasi PIN.

- Profil tetap disimpan dalam businesses.pos_config.cashiers dan dibagikan melalui
  sinkronisasi yang sama dengan aplikasi kasir. Tidak membuat akun Supabase Auth.
- Role Owner pada profil ini tidak memberikan login dashboard atau role super_admin.
- PIN disimpan sebagai pinSalt dan pinHash (SHA-256 salt:PIN) dengan format yang
  kompatibel dengan POS; plaintext PIN tidak disimpan. Hash/salt tidak dikirim ke
  browser admin dalam daftar user. PIN lama tetap utuh.
- Aksi memeriksa login, kepemilikan, cabang aktif dan versi pos_config_updated_at.
  Update memakai compare-and-set sehingga konfigurasi lama tidak menimpa perubahan
  perangkat/admin lain; kiriman ulang versi lama ditolak.
- ID dibuat di server. Seluruh konfigurasi, profil lama, opsi menu dan pengaturan
  tetap dipertahankan; profil baru ditambahkan ke array cashiers saja.
- Cabang harus memiliki konfigurasi POS yang sudah tersinkron. Konfigurasi kosong
  tidak diinisialisasi dari admin agar menu/pengaturan perangkat tidak terhapus.
- Daftar diambil per cabang, tanpa query per profil; penambahan memakai satu baca
  konfigurasi dan satu update bersyarat setelah pemeriksaan konteks bersama.
- Edit/hapus lama, kewajiban minimal satu profil Owner, dan larangan menghapus
  kasir dengan shift terbuka tetap berlaku. Perangkat menerima profil setelah sync.

## Verifikasi

```powershell
cd admin-dashboard
node --test tests/*.test.mjs
npx tsc --noEmit
cd ..
node scripts/test-platform-migration.mjs
```

Tes migration hanya memakai container lokal `supabase_db_kasir-warung-kopi` dan
melakukan rollback seluruh fixture/DDL tes. Tes membandingkan fingerprint semua
tabel public serta RLS, menjaga atribut Auth selain app_metadata, memeriksa akun
lama/baru, role palsu di user_metadata, role/status terpercaya, idempotensi, izin
trigger sebagai supabase_auth_admin, dan isolasi data super admin.

Tes aplikasi mencakup PIN kompatibel POS, kebocoran data PIN, cabang asing, stale
version, balapan update konfigurasi, validasi form, dan bootstrap hanya metadata.
