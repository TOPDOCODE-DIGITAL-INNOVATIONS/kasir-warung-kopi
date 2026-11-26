import Link from 'next/link'
import { AlertTriangle, Lock, Clock } from 'lucide-react'
import { accessMessage, type Access } from '../../../../shared/billing-access'

/** Pengingat langganan di atas setiap halaman dashboard Owner. */
export default function SubscriptionBanner({ access }: { access: Access }) {
  if (!access.showReminder) return null
  const tone = access.readOnly
    ? { box: 'border-red-200 bg-red-50 text-red-800', Icon: Lock, title: 'Mode hanya-baca' }
    : access.state === 'grace' || access.paymentIssue
      ? { box: 'border-amber-200 bg-amber-50 text-amber-900', Icon: AlertTriangle, title: 'Langganan perlu diperpanjang' }
      : { box: 'border-blue-200 bg-blue-50 text-blue-900', Icon: Clock, title: access.state === 'trial' ? 'Masa coba hampir habis' : access.tester ? 'Akses penguji hampir berakhir' : 'Langganan hampir berakhir' }
  return (
    <div role={access.readOnly ? 'alert' : 'status'} className={`mb-6 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm print:hidden ${tone.box}`}>
      <tone.Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1"><span className="font-semibold">{tone.title}.</span> {accessMessage(access)}</p>
      <Link href="/dashboard/billing" className="rounded-lg bg-white/80 px-3 py-1.5 font-semibold ring-1 ring-current/20 hover:bg-white">
        {access.state === 'active' && !access.paymentIssue ? 'Lihat langganan' : 'Berlangganan sekarang'}
      </Link>
    </div>
  )
}
