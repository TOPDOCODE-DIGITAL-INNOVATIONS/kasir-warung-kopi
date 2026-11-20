import 'server-only'

export type BillingEnvironment = 'test' | 'live'

const productionDbHost = 'abxqhjuhleopzstxmvet.supabase.co'
const developmentDbHost = 'qoqfeoeuzeignsuwnlbv.supabase.co'
const legacyProductionOrigin = 'https://kasir-warung-kopi.vercel.app'

export function platformBillingEnvironment(): BillingEnvironment {
  return process.env.VERCEL_ENV === 'production' ? 'live' : 'test'
}

export function assertPlatformBillingDatabase() {
  const deployment = process.env.VERCEL_ENV
  if (process.env.VERCEL === '1' && !deployment) throw new Error('VERCEL_ENV belum tersedia untuk billing platform.')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const hostname = url && URL.canParse(url) && new URL(url).hostname
  if (!hostname || (platformBillingEnvironment() === 'test' && hostname === productionDbHost)
    || (platformBillingEnvironment() === 'live' && hostname !== productionDbHost)) {
    throw new Error('Target Supabase tidak sesuai dengan lingkungan billing platform.')
  }
  if (deployment === 'preview' && hostname !== developmentDbHost) {
    throw new Error('Billing platform Preview memerlukan Supabase Dev.')
  }
}

function httpsOrigin(value?: string) {
  if (!value || !URL.canParse(value)) return null
  const url = new URL(value)
  return url.protocol === 'https:' && url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password
    ? url.origin : null
}

export function platformBillingPublicOrigin() {
  const deployment = process.env.VERCEL_ENV
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL
  const deploymentHost = deployment === 'production' ? productionHost
    : deployment === 'preview' ? process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL : undefined
  const configured = process.env.PLATFORM_BILLING_PUBLIC_URL?.trim()
  const origin = httpsOrigin(configured || (deploymentHost ? `https://${deploymentHost}` : undefined))
  if (origin && (deployment === 'production' || !isLiveOrigin(origin))) return origin
  throw new Error('Atur PLATFORM_BILLING_PUBLIC_URL ke origin HTTPS untuk lingkungan billing ini.')
}

function platformLiveOrigin() {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL
  return httpsOrigin(process.env.PLATFORM_BILLING_LIVE_DASHBOARD_URL?.trim() || (host ? `https://${host}` : undefined))
}

function isLiveOrigin(origin: string) {
  return origin === platformLiveOrigin() || origin === legacyProductionOrigin
    || origin === `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
}

export function otherPlatformBillingDashboard() {
  const live = platformBillingEnvironment() === 'live'
  const origin = live
    ? httpsOrigin(process.env.PLATFORM_BILLING_TEST_DASHBOARD_URL?.trim())
    : platformLiveOrigin()
  if (!origin) return null
  const current = process.env.PLATFORM_BILLING_PUBLIC_URL?.trim()
  if (origin === httpsOrigin(current) || (live && isLiveOrigin(origin))) return null
  return `${origin}/platform`
}

export function platformXenditKey() {
  const live = platformBillingEnvironment() === 'live'
  const name = live ? 'XENDIT_LIVE_SECRET_KEY' : 'XENDIT_TEST_SECRET_KEY'
  const key = process.env[name]?.trim()
  if (!key?.startsWith(live ? 'xnd_production_' : 'xnd_development_')) {
    throw new Error(`Atur ${name} sesuai lingkungan billing ini.`)
  }
  return key
}

export function platformXenditWebhookConfig() {
  const live = platformBillingEnvironment() === 'live'
  const token = (live ? process.env.XENDIT_LIVE_WEBHOOK_TOKEN : process.env.XENDIT_TEST_WEBHOOK_TOKEN)?.trim()
  const businessId = platformXenditBusinessId()
  return token && businessId ? { token, businessId } : null
}

function platformXenditBusinessId() {
  return (platformBillingEnvironment() === 'live' ? process.env.XENDIT_LIVE_BUSINESS_ID : process.env.XENDIT_TEST_BUSINESS_ID)?.trim()
}

export function platformXenditAccount() {
  const secretKey = platformXenditKey()
  const businessId = platformXenditBusinessId()
  if (!businessId) throw new Error('Business ID akun utama Xendit belum dikonfigurasi.')
  return { secretKey, businessId }
}
