// Trusted operator script. No HTTP route, default password, or public role picker.
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

export async function bootstrapSuperAdmin(admin, { email, apply = false }) {
  let found
  for (let page = 1; ; page++) {
    const { data, error } = await admin.listUsers({ page, perPage: 100 })
    if (error) throw new Error('Gagal membaca akun Auth. Periksa URL dan secret key server.')
    found = data.users.find(user => user.email?.toLowerCase() === email.toLowerCase())
    if (found || data.users.length < 100) break
  }
  if (!found) throw new Error('Akun belum tersedia. Daftar dan konfirmasi email terlebih dahulu, lalu jalankan kembali skrip ini.')
  // Re-read before changing only app_metadata; never reset a password or user data.
  const { data, error } = await admin.getUserById(found.id)
  if (error || !data.user) throw new Error('Gagal memeriksa akun yang dipilih.')
  const user = data.user
  if (!user.email_confirmed_at) throw new Error('Konfirmasi email akun terlebih dahulu sebelum menjadikannya super admin.')
  const metadata = user.app_metadata ?? {}
  if (metadata.account_status && metadata.account_status !== 'active') {
    throw new Error('Akun tidak aktif. Skrip bootstrap tidak mengubah status akun.')
  }
  if (metadata.platform_role && !['owner', 'super_admin'].includes(metadata.platform_role)) {
    throw new Error('Role akun tidak dikenali. Tidak ada perubahan yang dilakukan.')
  }
  if (!apply) return { changed: false, role: metadata.platform_role ?? 'owner', preview: true }
  if (metadata.platform_role === 'super_admin' && metadata.account_status === 'active') {
    return { changed: false, role: 'super_admin', preview: false }
  }
  const { error: updateError } = await admin.updateUserById(user.id, {
    app_metadata: { ...metadata, platform_role: 'super_admin', account_status: 'active' },
  })
  if (updateError) throw new Error('Gagal menetapkan super admin. Tidak ada data bisnis yang diubah oleh skrip ini.')
  return { changed: true, role: 'super_admin', preview: false }
}

async function main() {
  const args = process.argv.slice(2)
  const flags = new Map()
  for (let i = 0; i < args.length; i++) {
    const flag = args[i]
    if (!['--email', '--apply', '--confirm-project'].includes(flag) || flags.has(flag)) throw new Error('Argumen tidak valid. Gunakan --email EMAIL [--apply --confirm-project HOST].')
    if (flag === '--apply') flags.set(flag, true)
    else {
      const value = args[++i]
      if (!value || value.startsWith('--')) throw new Error(`Nilai ${flag} wajib diisi.`)
      flags.set(flag, value)
    }
  }
  const email = flags.get('--email')
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Isi --email dengan email akun dashboard yang sudah dikonfirmasi.')
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!rawUrl || !secret) throw new Error('NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib tersedia di environment server.')
  const url = new URL(rawUrl)
  if (url.username || url.password || !['http:', 'https:'].includes(url.protocol)) throw new Error('URL Supabase tidak valid.')
  const apply = flags.has('--apply')
  if (apply && flags.get('--confirm-project') !== url.host) throw new Error(`Untuk menerapkan ke target ini, sertakan --confirm-project ${url.host}`)
  const require = createRequire(new URL('../admin-dashboard/package.json', import.meta.url))
  const { createClient } = require('@supabase/supabase-js')
  const client = createClient(rawUrl, secret, { auth: { persistSession: false, autoRefreshToken: false } })
  console.log(`Target: ${url.host}. Akun: ${email}. Mode: ${apply ? 'terapkan' : 'pratinjau'}.`)
  const result = await bootstrapSuperAdmin(client.auth.admin, { email, apply })
  console.log(result.preview ? `Role sekarang: ${result.role}. Belum ada perubahan.`
    : result.changed ? 'Super admin berhasil ditetapkan. Masuk ulang untuk memperbarui sesi.' : 'Akun sudah menjadi super admin aktif. Tidak ada perubahan.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
