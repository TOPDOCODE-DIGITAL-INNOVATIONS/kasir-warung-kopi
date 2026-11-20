import 'server-only'

import { platformDb } from '@/app/platform/db'
import { assertPlatformBillingDatabase } from './config'

export const billingUnavailableMessage = 'Billing platform belum siap. Periksa konfigurasi server dan migration Supabase.'

export function platformBillingDb() {
  assertPlatformBillingDatabase()
  return platformDb()
}

export async function requirePlatformBillingSchema(db: ReturnType<typeof platformBillingDb>) {
  const { data, error } = await db.rpc('platform_billing_schema_ready')
  if (error || data !== true) throw new Error(billingUnavailableMessage)
}
