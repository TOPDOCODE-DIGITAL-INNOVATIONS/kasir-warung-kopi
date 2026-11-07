import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Aplikasi kasir (PWA statis) disajikan dari public/kasir/ di URL /kasir/.
  // Trailing slash wajib supaya scope service worker benar; /kasir -> /kasir/ diatur di src/proxy.ts.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [{ source: '/kasir/', destination: '/kasir/index.html' }]
  },
  async headers() {
    return [
      {
        source: '/kasir/:file(sw.js|index.html|manifest.json)',
        headers: [{ key: 'Cache-Control', value: 'no-cache' }],
      },
      {
        source: '/kasir/',
        headers: [{ key: 'Cache-Control', value: 'no-cache' }],
      },
      {
        source: '/kasir/assets/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ]
  },
}

export default nextConfig
