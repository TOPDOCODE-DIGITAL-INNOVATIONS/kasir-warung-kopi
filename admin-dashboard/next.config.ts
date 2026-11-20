import type { NextConfig } from 'next'
import fs from 'fs'
import path from 'path'
import { parseEnv } from 'util'

const deployment = process.env.VERCEL_ENV
const hosted = deployment === 'preview' || deployment === 'production' || (process.env.VERCEL === '1' && deployment !== 'development')
const localDev = !hosted && process.env.NODE_ENV === 'development'

if (!hosted) {
  const rootDir = path.resolve(__dirname, '..')
  const mode = process.env.NODE_ENV === 'production' ? 'production' : 'development'
  const files = [`.env.${mode}.local`, '.env.local', `.env.${mode}`, '.env']
    .map(file => path.join(rootDir, file))
    .filter(file => fs.existsSync(file))
    .map(file => parseEnv(fs.readFileSync(file, 'utf8')))
  const databaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || files.find(env => env.NEXT_PUBLIC_SUPABASE_URL)?.NEXT_PUBLIC_SUPABASE_URL
  const databaseKeys = new Set(['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'])

  for (const env of files) {
    for (const [key, value] of Object.entries(env)) {
      // A local database override must never fall back to the Dev project's keys.
      if (databaseKeys.has(key) && env.NEXT_PUBLIC_SUPABASE_URL !== databaseUrl) continue
      if (!process.env[key]) process.env[key] = value
    }
  }
}

const tunnelHost = localDev && process.env.DEV_TUNNEL_HOST?.trim()

// Aplikasi kasir (/kasir/) adalah service Vercel terpisah; lihat ../vercel.json.
const nextConfig: NextConfig = {
  allowedDevOrigins: tunnelHost ? ['127.0.0.1', tunnelHost] : ['127.0.0.1'],
}

export default nextConfig
