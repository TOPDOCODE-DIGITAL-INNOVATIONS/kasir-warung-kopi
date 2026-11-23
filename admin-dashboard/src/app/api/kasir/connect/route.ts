import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/utils/supabase/admin'
import { platformAccount } from '@/lib/platform-account'
import { validEmail } from '@/lib/auth-flow'

export const preferredRegion = 'syd1'

/**
 * Menghubungkan perangkat kasir ke cabang.
 *
 * POST { action: 'login', email, password }
 *   -> { accessToken, branches: [{ id, name, address }] }   (hanya cabang milik akun Owner)
 * POST { action: 'select', businessId } + Authorization: Bearer <accessToken>
 *   -> { token, branch: { id, name }, hasConfig }
 * GET  + Authorization: Bearer <sync token>
 *   -> { branch: { id, name }, hasConfig }                   (mode "tempel token" / Link Kasir)
 *
 * Password tidak pernah disimpan. accessToken hanya dipakai sekali oleh kasir lalu dibuang.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS })
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

function bearer(request: Request) {
  return request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || ''
}

function publicClient(accessToken?: string): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) throw new Error('Server belum dikonfigurasi (env Supabase).')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
  })
}

async function ownerFromToken(accessToken: string) {
  if (!accessToken) return { error: json({ success: false, error: 'Silakan masuk kembali.' }, 401) }
  const client = publicClient(accessToken)
  const { data: { user }, error } = await client.auth.getUser(accessToken)
  if (error || !user) return { error: json({ success: false, error: 'Sesi login berakhir. Silakan masuk kembali.' }, 401) }
  let role
  try { role = platformAccount(user).role } catch { role = null }
  if (role !== 'owner') return { error: json({ success: false, error: 'Hanya akun Owner yang dapat menghubungkan kasir.' }, 403) }
  return { client, user }
}

async function login(body: Record<string, unknown>) {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!validEmail(email) || !password || password.length > 128) {
    return json({ success: false, error: 'Isi email dan password akun Owner.' }, 400)
  }
  const { data, error } = await publicClient().auth.signInWithPassword({ email, password })
  if (error || !data.session) {
    const message = error?.code === 'email_not_confirmed'
      ? 'Email belum dikonfirmasi. Buka tautan konfirmasi di inbox Anda.'
      : error?.code === 'over_request_rate_limit'
        ? 'Terlalu banyak percobaan. Tunggu beberapa menit.'
        : 'Email atau password salah.'
    return json({ success: false, error: message }, 401)
  }
  const owner = await ownerFromToken(data.session.access_token)
  if ('error' in owner) return owner.error
  const { data: rows, error: listError } = await owner.client.from('businesses')
    .select('id,name,address').eq('owner_id', owner.user.id).order('created_at').order('id').limit(500)
  if (listError) return json({ success: false, error: 'Daftar cabang belum dapat dimuat.' }, 500)
  return json({
    success: true,
    accessToken: data.session.access_token,
    branches: (rows ?? []).map(b => ({ id: b.id, name: b.name, address: b.address ?? null })),
  })
}

async function select(request: Request, body: Record<string, unknown>) {
  const businessId = typeof body.businessId === 'string' ? body.businessId : ''
  if (!UUID.test(businessId)) return json({ success: false, error: 'Pilih cabang.' }, 400)
  const owner = await ownerFromToken(bearer(request))
  if ('error' in owner) return owner.error
  const { data, error } = await owner.client.from('businesses')
    .select('id,name,sync_token,pos_config').eq('id', businessId).eq('owner_id', owner.user.id).maybeSingle()
  if (error) return json({ success: false, error: 'Cabang belum dapat dimuat.' }, 500)
  if (!data || !data.sync_token) return json({ success: false, error: 'Cabang tidak ditemukan pada akun ini.' }, 404)
  return json({
    success: true,
    token: data.sync_token,
    branch: { id: data.id, name: data.name },
    hasConfig: !!data.pos_config,
  })
}

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    const parsed = await request.json()
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
    body = parsed
  } catch {
    return json({ success: false, error: 'Body harus JSON' }, 400)
  }
  try {
    if (body.action === 'login') return await login(body)
    if (body.action === 'select') return await select(request, body)
    return json({ success: false, error: 'Aksi tidak dikenal' }, 400)
  } catch (err) {
    console.error('[kasir-connect]', err)
    return json({ success: false, error: 'Server belum dapat menghubungkan kasir. Coba lagi.' }, 500)
  }
}

/** Verifikasi token sync (mode tempel token / Link Kasir). */
export async function GET(request: Request) {
  const token = bearer(request)
  if (!token || token.length > 200) return json({ success: false, error: 'Token kosong atau tidak valid.' }, 401)
  try {
    const { data, error } = await createAdminClient(token).from('businesses')
      .select('id,name,pos_config').eq('sync_token', token).maybeSingle()
    if (error) return json({ success: false, error: 'Gagal memeriksa token.' }, 500)
    if (!data) return json({ success: false, error: 'Token tidak valid. Salin ulang dari Dashboard → Cabang & Token.' }, 401)
    return json({ success: true, branch: { id: data.id, name: data.name }, hasConfig: !!data.pos_config })
  } catch (err) {
    console.error('[kasir-connect]', err)
    return json({ success: false, error: 'Server belum dapat memeriksa token.' }, 500)
  }
}
