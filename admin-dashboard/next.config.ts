import type { NextConfig } from 'next'
import fs from 'fs'
import path from 'path'
import { parseEnv } from 'util'

// Muat file .env terpusat dari root repo (kasir-warung-kopi/.env).
// Catatan: loadEnvConfig() dari @next/env tidak bisa dipakai di sini karena Next sudah
// memanggilnya untuk folder admin-dashboard dan hasilnya di-cache, sehingga panggilan
// kedua untuk folder root diabaikan. Nilai yang sudah ada (mis. dari Vercel) tidak ditimpa.
const rootDir = path.resolve(__dirname, '..')
const mode = process.env.NODE_ENV === 'production' ? 'production' : 'development'
for (const file of [`.env.${mode}.local`, '.env.local', `.env.${mode}`, '.env']) {
  const full = path.join(rootDir, file)
  if (!fs.existsSync(full)) continue
  for (const [key, value] of Object.entries(parseEnv(fs.readFileSync(full, 'utf8')))) {
    if (process.env[key] === undefined || process.env[key] === '') process.env[key] = value
  }
}

// Aplikasi kasir (/kasir/) adalah service Vercel terpisah; lihat ../vercel.json.
const nextConfig: NextConfig = {}

export default nextConfig
