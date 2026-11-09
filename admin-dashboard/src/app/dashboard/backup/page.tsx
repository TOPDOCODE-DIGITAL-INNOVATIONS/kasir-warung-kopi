import { createClient } from '@/utils/supabase/server'
import { pickBusinessId } from '@/lib/business-filter'
import BackupClient from './BackupClient'

export default async function BackupPage({ searchParams }: { searchParams: Promise<{ b?: string | string[] }> }) {
  const businessId = pickBusinessId((await searchParams).b)
  const supabase = await createClient()
  const businesses: { id: string; name: string }[] = []
  let lastId: string | undefined
  let errorMessage: string | null = null

  // Daftar cabang diambil sekaligus per halaman, termasuk bila melebihi batas API.
  while (true) {
    let query = supabase.from('businesses').select('id, name').order('id').limit(500)
    if (lastId) query = query.gt('id', lastId)
    const { data, error } = await query
    if (error) {
      errorMessage = 'Gagal memuat cabang. Muat ulang halaman untuk mencoba lagi.'
      break
    }
    if (!data?.length) break
    businesses.push(...data)
    lastId = data[data.length - 1].id
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Backup</h1>
        <p className="text-gray-500 text-sm mt-1">Unduh data cabang untuk arsip dan kebutuhan pengembangan aplikasi.</p>
      </div>
      {errorMessage && <p role="alert" className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{errorMessage}</p>}
      <BackupClient businesses={businesses} initialBusinessId={businessId} unavailable={!!errorMessage} />
    </div>
  )
}
