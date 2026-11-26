
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const migrationsDir = path.join(rootDir, 'supabase', 'migrations')
const testsDir = path.join(rootDir, 'supabase', 'tests')

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  const out = {}
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(trimmed)
    if (m) {
      const val = m[2].replace(/^['"]|['"]$/g, '')
      if (val !== '') out[m[1]] = val
    }
  }
  return out
}

function readSupabaseCliToken() {
  const tokenFile = path.join(os.homedir(), '.supabase', 'access-token')
  if (fs.existsSync(tokenFile)) {
    const t = fs.readFileSync(tokenFile, 'utf8').trim()
    if (t) return t
  }
  if (process.platform === 'darwin') {
    try {
      const t = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
      if (t) return t
    } catch {
      // ignore if keychain entry does not exist
    }
  }
  return ''
}

// Satu file .env untuk semua lingkungan. Database yang dituju = NEXT_PUBLIC_SUPABASE_URL di .env.
// APP_ENV (development | preview | production) menentukan pengaman:
//   development     -> langsung jalan
//   preview         -> migrasi minta konfirmasi ref project
//   production      -> migrasi minta konfirmasi ref project, SQL tests ditolak
const args = process.argv.slice(2)
// --local: jalankan lewat psql ke DATABASE_URL (Supabase lokal / CI). Hanya untuk `test`.
const local = args.includes('--local')
const assumeYes = args.includes('--yes') || args.includes('-y')
const APP_ENVS = ['development', 'preview', 'production']

function resolveConfig() {
  if (local) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('--local membutuhkan DATABASE_URL (mis. postgresql://postgres:postgres@127.0.0.1:54322/postgres)')
    if (!/@(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error('--local hanya untuk database lokal (127.0.0.1/localhost).')
    return { local: true, url, target: 'local', label: 'LOCAL' }
  }
  // Nilai di .env menang atas variabel yang ter-export di shell, agar target selalu
  // sama dengan isi file yang sedang Anda lihat.
  const env = { ...process.env, ...readEnvFile(path.join(rootDir, '.env')) }
  const target = (env.APP_ENV || 'development').trim().toLowerCase()
  if (!APP_ENVS.includes(target)) {
    throw new Error(`APP_ENV tidak valid: "${env.APP_ENV}". Gunakan: ${APP_ENVS.join(' | ')}`)
  }
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL belum diset di .env')
  }
  const refMatch = /https:\/\/([a-z0-9]+)\.supabase\.co/i.exec(url)
  if (!refMatch) {
    throw new Error(`Format NEXT_PUBLIC_SUPABASE_URL tidak valid: ${url}`)
  }
  const projectRef = refMatch[1]
  const token = (env.SUPABASE_ACCESS_TOKEN || '').trim() || readSupabaseCliToken()
  if (!token) {
    throw new Error('Token Supabase tidak ditemukan. Jalankan `npx supabase login` atau isi SUPABASE_ACCESS_TOKEN di .env')
  }

  return { projectRef, token, target, label: `${target.toUpperCase()} ${projectRef}` }
}

async function confirmTarget(config, action) {
  if (config.local || config.target === 'development' || assumeYes) return
  if (!process.stdin.isTTY) {
    throw new Error(`Menolak ${action} ke ${config.label} tanpa konfirmasi. Tambahkan --yes jika memang disengaja.`)
  }
  const { createInterface } = await import('node:readline/promises')
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question(
    `⚠️  Akan ${action} ke database ${config.label} (APP_ENV=${config.target}). Ketik ref project untuk lanjut: `
  )
  rl.close()
  if (answer.trim() !== config.projectRef) {
    throw new Error('Dibatalkan.')
  }
}

async function runLocal(query, url) {
  const { spawn } = await import('node:child_process')
  return new Promise((resolve, reject) => {
    const child = spawn('psql', [url, '-v', 'ON_ERROR_STOP=1', '-q', '-X', '-f', '-'], { stdio: ['pipe', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (d) => { stderr += d })
    child.stdout.resume()
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve([])
      // NOTICE PASS: ... dari test ikut ditampilkan agar kegagalan mudah dilacak.
      else reject(new Error(`psql gagal (exit ${code}):\n${stderr.split('\n').filter((l) => !/NOTICE:\s+PASS/.test(l)).join('\n')}`))
    })
    child.stdin.end(query)
  })
}

export async function runQuery(query, config = resolveConfig()) {
  if (config.local) return runLocal(query, config.url)
  const res = await fetch(`https://api.supabase.com/v1/projects/${config.projectRef}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} (${config.projectRef}): ${text}`)
  }
  return JSON.parse(text)
}

async function ensureMigrationsTable(config) {
  await runQuery(
    `
    CREATE SCHEMA IF NOT EXISTS supabase_migrations;
    CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
      version text NOT NULL PRIMARY KEY,
      statements text[],
      name text
    );
  `,
    config
  )
}

export async function status() {
  const config = resolveConfig()
  await ensureMigrationsTable(config)
  const appliedRows = await runQuery(
    `SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;`,
    config
  )
  const applied = new Map(appliedRows.map((r) => [r.version, r.name]))
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  console.log(`Status Migrasi (${config.label}):`)
  for (const file of files) {
    const match = /^(\d+)_(.+)\.sql$/.exec(file)
    if (!match) continue
    const [, version] = match
    console.log(`  ${applied.has(version) ? '✅ APPLIED' : '⏳ PENDING'}  ${file}`)
  }
}

export async function migrate() {
  const config = resolveConfig()
  await confirmTarget(config, 'menjalankan migrasi')
  console.log(`Menjalankan migrasi ke (${config.label})...`)
  await ensureMigrationsTable(config)

  const appliedRows = await runQuery(
    `SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;`,
    config
  )
  const applied = new Set(appliedRows.map((r) => r.version))

  if (!applied.has('20261109033808')) {
    const check = await runQuery(
      `SELECT to_regclass('public.businesses') IS NOT NULL AS has_businesses;`,
      config
    )
    if (check?.[0]?.has_businesses) {
      await runQuery(
        `INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261109033808', 'baseline_production') ON CONFLICT (version) DO NOTHING;`,
        config
      )
      applied.add('20261109033808')
      console.log(`  [REPAIR] 20261109033808_baseline_production.sql ditandai applied (${config.label})`)
    }
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  let appliedCount = 0
  for (const file of files) {
    const match = /^(\d+)_(.+)\.sql$/.exec(file)
    if (!match) continue
    const [, version, name] = match
    if (applied.has(version)) {
      console.log(`  [SKIP] ${file} (sudah diterapkan)`)
      continue
    }
    console.log(`  [RUN]  ${file}...`)
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
    await runQuery(sql, config)
    const escVersion = version.replace(/'/g, "''")
    const escName = name.replace(/'/g, "''")
    await runQuery(
      `
      INSERT INTO supabase_migrations.schema_migrations (version, name)
      VALUES ('${escVersion}', '${escName}')
      ON CONFLICT (version) DO NOTHING;
    `,
      config
    )
    appliedCount++
    console.log(`  [DONE] ${file}`)
  }

  console.log(
    appliedCount > 0
      ? `Selesai: ${appliedCount} migrasi baru berhasil diterapkan ke (${config.label}).`
      : `Semua ${files.length} migrasi sudah up-to-date di (${config.label}).`
  )
}

export async function test() {
  const config = resolveConfig()
  if (config.target === 'production' && !args.includes('--allow-prod-tests')) {
    throw new Error('SQL tests tidak dijalankan saat APP_ENV=production. Arahkan .env ke database dev.')
  }
  console.log(`Menjalankan SQL tests pada (${config.label})...`)

  const testFiles = [
    'inventory_foundation.sql',
    'sync_drafts_and_transaction_edits.sql',
    'admin_inventory.sql',
    'platform_account_roles.sql',
    'platform_xendit_webhook.sql',
    'owner_self_service_billing.sql',
    'hpp_purchase_correction.sql',
    'sync_events.sql',
    'platform_tester_access.sql',
    'payroll_salary.sql',
  ]

  const platformMigration = fs
    .readFileSync(path.join(migrationsDir, '20261116080000_platform_account_roles.sql'), 'utf8')
    .replace(/^begin;\s*$/gim, '')
    .replace(/^commit;\s*$/gim, '')

  for (const file of testFiles) {
    const fullPath = path.join(testsDir, file)
    if (!fs.existsSync(fullPath)) continue
    let sql = fs.readFileSync(fullPath, 'utf8')
    if (file === 'platform_account_roles.sql') {
      sql = sql
        .replaceAll('-- APPLY_MIGRATION_HERE', () => platformMigration)
        .replace(
          'set local role supabase_auth_admin;',
          () => `do $$ begin if pg_has_role(current_user, 'supabase_auth_admin', 'member') then execute 'set local role supabase_auth_admin'; end if; end $$;`
        )
    }
    console.log(`  [TEST] ${file}...`)
    await runQuery(sql, config)
    console.log(`  [PASS] ${file}`)
  }

  console.log(`Semua ${testFiles.length} test database LULUS di (${config.label})!`)
}

async function main() {
  const cmd = args.find((a) => !a.startsWith('-')) || 'status'
  if (local && cmd !== 'test') throw new Error('--local hanya mendukung perintah test; migrasi lokal diterapkan oleh `supabase db start`.')
  if (cmd === 'status') {
    await status()
  } else if (cmd === 'migrate') {
    await migrate()
  } else if (cmd === 'test') {
    await test()
  } else if (cmd === 'all') {
    await migrate()
    if (local || resolveConfig().target !== 'production') await test()
  } else {
    throw new Error(`Perintah tidak dikenal: ${cmd}. Gunakan: status | migrate | test | all`)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message || err)
    process.exitCode = 1
  })
}
