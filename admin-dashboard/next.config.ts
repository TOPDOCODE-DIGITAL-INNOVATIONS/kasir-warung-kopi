import type { NextConfig } from 'next'
import path from 'path'
import { loadEnvConfig } from '@next/env'

// Muat file .env terpusat dari root repo (kasir-warung-kopi/.env)
loadEnvConfig(path.resolve(__dirname, '..'))

// Aplikasi kasir (/kasir/) adalah service Vercel terpisah; lihat ../vercel.json.
const nextConfig: NextConfig = {}

export default nextConfig
