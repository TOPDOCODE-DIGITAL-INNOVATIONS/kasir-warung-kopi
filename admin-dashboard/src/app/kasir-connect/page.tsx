import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Store } from 'lucide-react'
import { createClient } from '@/utils/supabase/server'
import { platformAccount } from '@/lib/platform-account'
import AuthCard from '@/components/AuthCard'
import SubmitButton from '@/components/SubmitButton'
import { linkKasirToBranch } from './actions'

export const dynamic = 'force-dynamic'

/** Dipakai tombol "Masuk dengan Google" di aplikasi kasir: pilih cabang lalu kembali ke /kasir/. */
export default async function KasirConnectPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/kasir-connect')
  const isOwner = platformAccount(user).role === 'owner'
  const { data: branches } = isOwner
    ? await supabase.from('businesses').select('id,name,address').eq('owner_id', user.id).order('created_at').order('id')
    : { data: [] }

  return (
    <AuthCard title="Hubungkan Kasir" subtitle={`Pilih cabang untuk perangkat kasir ini · ${user.email ?? ''}`}>
      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-center text-sm text-red-600">Cabang tidak ditemukan pada akun ini.</p>}
      {!isOwner ? (
        <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">Hanya akun Owner yang dapat menghubungkan kasir.</p>
      ) : !branches?.length ? (
        <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-700">
          Belum ada cabang. <Link href="/dashboard/businesses" className="font-semibold text-blue-600 underline">Buat cabang di dashboard</Link> terlebih dahulu.
        </p>
      ) : (
        <ul className="space-y-3">
          {branches.map(b => (
            <li key={b.id}>
              <form action={linkKasirToBranch}>
                <input type="hidden" name="business_id" value={b.id} />
                <SubmitButton pendingLabel="Menghubungkan..." className="w-full justify-start rounded-xl border border-gray-200 px-4 py-3 text-left hover:border-blue-400 hover:bg-blue-50">
                  <Store className="h-5 w-5 shrink-0 text-blue-600" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block font-semibold text-gray-900">{b.name}</span>
                    {b.address && <span className="block truncate text-xs text-gray-500">{b.address}</span>}
                  </span>
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}
    </AuthCard>
  )
}
