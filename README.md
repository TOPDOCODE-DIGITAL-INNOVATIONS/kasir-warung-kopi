# Kasir Warung Kopi (Offline POS)

Aplikasi kasir (PWA) untuk warung kopi. Semua data disimpan di `localStorage` perangkat, sehingga tetap bisa dipakai tanpa internet. Transaksi bisa disinkronkan ke server lewat endpoint HTTP.

## Menjalankan

Butuh Node.js 20+.

```bash
npm install
npm run dev       # http://localhost:3000 (bisa diakses dari tablet di jaringan yang sama)
npm run build     # build produksi ke dist/
npm run preview   # sajikan hasil build (service worker/offline aktif di sini)
npm test          # unit test
npm run lint      # typecheck
```

Service worker hanya aktif di build produksi. Setelah app dibuka sekali dalam keadaan online, app bisa dibuka lagi tanpa internet.

## Akun contoh

| Nama          | Role       | PIN  |
|---------------|------------|------|
| Budi Santoso  | Owner      | 1234 |
| Siti Rahma    | Kasir      | 1111 |
| Agus Warkop   | Kasir      | 2222 |

**Ganti semua PIN ini** di menu *Kelola Kasir & Shift* sebelum dipakai sungguhan.

## Hak akses

| Fitur                                   | Kasir | Supervisor | Owner |
|-----------------------------------------|:-----:|:----------:|:-----:|
| Transaksi, riwayat, lunasi bon          |   ✓   |     ✓      |   ✓   |
| Batalkan nota*                          |       |     ✓      |   ✓   |
| Katalog menu & stok, laporan            |       |     ✓      |   ✓   |
| Kelola kasir, pengaturan, backup/reset  |       |            |   ✓   |

\* Pembatalan selalu meminta PIN Supervisor/Owner, sehingga kasir tetap bisa membatalkan nota dengan persetujuan atasan.

## Alur harian

1. **Buka shift.** Pilih kasir, masukkan PIN dan modal awal laci. Selama shift belum dibuka, transaksi tidak bisa dilakukan.
2. **Transaksi.** Stok dicek saat item ditambahkan dan saat checkout.
3. **Bon/hutang.** Transaksi bon tercatat "Belum Lunas". Pelunasannya dilakukan dari *Riwayat Transaksi → tombol Lunasi*, dan uangnya masuk ke shift yang sedang terbuka.
4. **Tutup shift.** Hitung uang fisik di laci. Selisihnya tercatat di *Laporan → Riwayat Shift*.

## Sinkronisasi

Atur URL dan token di *Pengaturan*. Sync berjalan otomatis saat perangkat online (setiap ada perubahan dan tiap 5 menit) jika opsi auto-sync aktif. Pembatalan dan pelunasan bon akan menandai transaksi untuk dikirim ulang. Pengeluaran baru dikirim lewat `expenses`; pengeluaran yang sudah terkirim lalu dihapus dikirim ID-nya lewat `deletedExpenseIds` agar server ikut menghapus.

Payload `POST` yang dikirim:

```json
{
  "storeName": "...",
  "deviceCode": "K7Q",
  "timestamp": "ISO-8601",
  "transactions": [ /* Transaction[] lihat src/types.ts */ ],
  "expenses": [ /* Expense[] yang belum terkirim (scope 'daily' | 'monthly') */ ],
  "deletedExpenseIds": [ /* ID pengeluaran yang dihapus di kasir */ ],
  "products": [ /* Product[] */ ],
  "shift": { /* Shift aktif atau null */ }
}
```

Header: `Authorization: Bearer <token>` dan `x-api-key: <token>`.

Server harus *upsert* berdasarkan `id` (transaksi & pengeluaran bisa dikirim ulang bila berubah) dan membalas status 2xx; selain itu data dianggap belum terkirim dan akan dicoba lagi.

## Catatan keamanan

- PIN disimpan sebagai hash SHA-256 dengan salt, tidak lagi sebagai teks biasa.
- Token sync tetap tersimpan di perangkat (`localStorage`) karena app ini sepenuhnya client-side. Gunakan token khusus kasir yang bisa dicabut dari server. Token tidak ikut disimpan di file backup JSON.
- Semua pembatasan akses ada di sisi perangkat. Orang yang memegang perangkat dan paham DevTools tetap bisa mengubah data lokal.

## Printer struk (VSC / Rongta RPP02N, 58mm)

Struk dibuat sebagai teks 32 kolom (format bawaan printer 58mm) di `src/lib/receipt.ts`, lalu dikirim lewat salah satu cara berikut (*Pengaturan → Printer Struk*):

| Cara | Keterangan |
|------|------------|
| **Langsung – Bluetooth klasik / USB** (disarankan) | Web Serial. Pair printer, tekan *Hubungkan Printer* sekali, lalu struk langsung tercetak tanpa dialog. Butuh Chrome Android 138+ atau Chrome desktop. |
| **Langsung – Bluetooth LE** | Web Bluetooth, hanya untuk printer yang mendukung BLE. |
| **RawBT** | Android, membuka aplikasi RawBT sebentar setiap cetak. |
| **Dialog print browser** | Muncul dialog cetak (kertas 58mm, margin None, skala 100%). Di PC bisa tanpa dialog dengan Chrome `--kiosk-printing`. |

Cetak otomatis setelah pembayaran aktif secara default untuk metode "Langsung".

Gunakan tombol **Tes Printer** untuk memastikan baris angka 32 karakter tercetak pas satu baris.

## Nomor struk

Formatnya `WKP-YYYYMMDD-XXX-NNNN`: tanggal lokal (WIB), kode perangkat 3 karakter, dan nomor urut harian.
