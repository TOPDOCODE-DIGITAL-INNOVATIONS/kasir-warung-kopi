import type { NextConfig } from 'next'
import fs from 'node:fs'
import path from 'path'
import { parseEnv } from 'node:util'

// Next sudah memuat env admin-dashboard dan menyimpan hasilnya di cache @next/env.
// Baca env root langsung agar konfigurasi terpusat tetap dimuat. Nilai dari
// environment deployment atau env admin-dashboard tetap mendapat prioritas.
const rootDir = path.resolve(__dirname, '..')
const mode = process.env.NODE_ENV ?? 'development'
const envFiles = [
  `.env.${mode}.local`,
  ...(mode === 'test' ? [] : ['.env.local']),
  `.env.${mode}`,
  '.env',
]
for (const file of envFiles) {
  const fullPath = path.join(rootDir, file)
  if (!fs.existsSync(fullPath)) continue
  for (const [key, value] of Object.entries(parseEnv(fs.readFileSync(fullPath, 'utf8')))) {
    if (process.env[key] === undefined) process.env[key] = value
  }
}

// Aplikasi kasir (/kasir/) adalah service Vercel terpisah; lihat ../vercel.json.
const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
}

export default nextConfig
