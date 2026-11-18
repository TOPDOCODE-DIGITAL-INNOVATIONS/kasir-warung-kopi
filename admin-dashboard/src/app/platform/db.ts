import 'server-only'

import { createAdminClient } from '@/utils/supabase/admin'

export function platformDb() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Secret key server belum dikonfigurasi.')
  return createAdminClient()
}
