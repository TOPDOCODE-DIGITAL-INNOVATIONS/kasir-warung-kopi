
import fs from 'node:fs'
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
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
  return out
}

// Target database:
//   dev  (default) -> .env       (dipakai juga oleh `npm run dev` admin-dashboard & app-kasir)
//   prod           -> .env.prod  (HANYA dibaca script ini; tidak dimuat otomatis oleh Next/Vite)
// Pilih dengan flag --prod atau DB_TARGET=prod.
const args = process.argv.slice(2)
const target = args.includes('--prod') || process.env.DB_TARGET === 'prod' ? 'prod' : 'dev'
const assumeYes = args.includes('--yes') || args.includes('-y')
const ENV_FILES = { dev: '.env', prod: '.env.prod' }

function resolveConfig() {
  const envFile = ENV_FILES[target]
  const envPath = path.join(rootDir, envFile)
  if (target === 'prod' && !fs.existsSync(envPath)) {
    throw new Error(`File ${envFile} tidak ditemukan. Buat dari .env.example dan isi kredensial project PROD.`)
  }
  // Untuk prod, file .env.prod menang atas process.env agar variabel dev yang ter-export
  // di shell tidak membuat migrasi "prod" diam-diam jalan ke DB dev (atau sebaliknya).
  const fileEnv = readEnvFile(envPath)
  const env = target === 'prod' ? { ...process.env, ...fileEnv } : { ...fileEnv, ...process.env }
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) {
    throw new Error(`NEXT_PUBLIC_SUPABASE_URL belum diset di ${envFile}`)
  }
  const refMatch = /https:\/\/([a-z0-9]+)\.supabase\.co/i.exec(url)
  if (!refMatch) {
    throw new Error(`Format NEXT_PUBLIC_SUPABASE_URL tidak valid: ${url}`)
  }
  const projectRef = refMatch[1]
  const token = env.SUPABASE_ACCESS_TOKEN
  if (!token) {
    throw new Error(`SUPABASE_ACCESS_TOKEN belum diset di ${envFile}`)
  }

  // Cegah salah target: ref prod tidak boleh sama dengan ref dev.
  if (target === 'prod') {
    const devUrl = readEnvFile(path.join(rootDir, '.env')).NEXT_PUBLIC_SUPABASE_URL
    const devRef = devUrl && /https:\/\/([a-z0-9]+)\.supabase\.co/i.exec(devUrl)?.[1]
    if (devRef && devRef === projectRef) {
      throw new Error(`.env.prod menunjuk ke project yang sama dengan .env (dev): ${projectRef}`)
    }
  }

  return { projectRef, token, target, label: `${target.toUpperCase()} ${projectRef}` }
}

async function confirmProd(config, action) {
  if (config.target !== 'prod' || assumeYes) return
  if (!process.stdin.isTTY) {
    throw new Error(`Menolak ${action} ke PROD tanpa konfirmasi. Tambahkan --yes jika memang disengaja.`)
  }
  const { createInterface } = await import('node:readline/promises')
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question(
    `⚠️  Akan ${action} ke database PROD (${config.label}). Ketik ref project untuk lanjut: `
  )
  rl.close()
  if (answer.trim() !== config.projectRef) {
    throw new Error('Dibatalkan.')
  }
}

export async function runQuery(query, config = resolveConfig()) {
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
  await confirmProd(config, 'menjalankan migrasi')
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
  if (config.target === 'prod' && !args.includes('--allow-prod-tests')) {
    throw new Error('SQL tests tidak dijalankan di PROD. Jalankan di dev (npm run db:test).')
  }
  console.log(`Menjalankan SQL tests pada (${config.label})...`)

  const testFiles = [
    'inventory_foundation.sql',
    'sync_drafts_and_transaction_edits.sql',
    'admin_inventory.sql',
    'platform_account_roles.sql',
    'platform_billing_preview.sql',
    'platform_xendit_one_time_payments.sql',
    'platform_payment_monitoring.sql',
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
  if (cmd === 'status') {
    await status()
  } else if (cmd === 'migrate') {
    await migrate()
  } else if (cmd === 'test') {
    await test()
  } else if (cmd === 'all') {
    await migrate()
    if (target !== 'prod') await test()
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
