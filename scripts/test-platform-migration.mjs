import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

// Fixed local Docker target only. Never reads SUPABASE_DB_PASSWORD or a remote URL.
const migration = fs.readFileSync(new URL('../supabase/migrations/20261116080000_platform_account_roles.sql', import.meta.url), 'utf8')
  .replace(/^begin;\s*$/gmi, '').replace(/^commit;\s*$/gmi, '')
const test = fs.readFileSync(new URL('../supabase/tests/platform_account_roles.sql', import.meta.url), 'utf8')
const sql = test.replaceAll('-- APPLY_MIGRATION_HERE', () => migration)
execFileSync('docker', ['exec', '-i', 'supabase_db_kasir-warung-kopi', 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
  input: sql, stdio: ['pipe', 'inherit', 'inherit'], windowsHide: true,
})
