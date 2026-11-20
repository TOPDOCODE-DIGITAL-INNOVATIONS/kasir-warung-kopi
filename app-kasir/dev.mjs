import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const cashierDir = fileURLToPath(new URL('./', import.meta.url))
const dashboardDir = fileURLToPath(new URL('../admin-dashboard/', import.meta.url))
const dashboardRequire = createRequire(new URL('../admin-dashboard/package.json', import.meta.url))
const nextCli = dashboardRequire.resolve('next/dist/bin/next')
const host = '127.0.0.1'
const publicPort = 3000
const dashboardPort = 3001

const server = await createServer({
  root: cashierDir,
  plugins: [
    {
      name: 'kasir-local-redirect',
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          const url = request.url ?? ''
          if (url.split('?')[0] !== '/kasir') return next()
          response.writeHead(307, { Location: '/kasir/' + url.slice('/kasir'.length) })
          response.end()
        })
      },
    },
  ],
  server: {
    host,
    port: publicPort,
    strictPort: true,
    proxy: {
      '^/(?!kasir(?:/|$))': {
        target: `http://${host}:${dashboardPort}`,
        ws: true,
        xfwd: true,
        autoRewrite: true,
      },
    },
  },
})

await server.listen()
console.log(`Buka http://localhost:${publicPort}/dashboard atau http://localhost:${publicPort}/kasir/`)

const dashboard = spawn(process.execPath, [nextCli, 'dev', '--hostname', host, '--port', String(dashboardPort)], {
  cwd: dashboardDir,
  stdio: 'inherit',
})

let closing = false
async function close(code) {
  if (closing) return
  closing = true
  process.exitCode = code
  if (dashboard.exitCode === null && dashboard.signalCode === null && dashboard.pid) {
    dashboard.kill('SIGTERM')
  }
  await server.close()
}

dashboard.once('error', error => {
  console.error(error.message)
  void close(1)
})
dashboard.once('exit', code => { void close(code ?? 0) })
process.once('SIGINT', () => { void close(0) })
process.once('SIGTERM', () => { void close(0) })
