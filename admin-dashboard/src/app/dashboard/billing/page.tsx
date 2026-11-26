import { CalendarClock, CheckCircle2, CreditCard, ShieldCheck } from 'lucide-react'
import { getCurrentOwnerAccess, billingEnabled, billingEnvironment, BILLING_DISABLED_MESSAGE } from '@/lib/billing/owner-billing'
import { accessMessage, GRACE_DAYS, type AccessState } from '../../../../../shared/billing-access'
import { formatDateTime, rupiah } from '@/lib/format'
import { BillingActionButton, PlanCheckoutButton } from './BillingButtons'
import { cancelAutoRenewal, checkPaymentStatus } from './actions'
import { Badge, Notice, PageHeader, Panel, ui } from '@/components/ui'

export const dynamic = 'force-dynamic'

const STATE_LABEL: Record<AccessState, { label: string; tone: string }> = {
  trial: { label: 'Masa coba gratis', tone: 'bg-sky-400/15 text-sky-200 ring-sky-300/30' },
  active: { label: 'Berlangganan', tone: 'bg-emerald-400/15 text-emerald-200 ring-emerald-300/30' },
  grace: { label: 'Masa toleransi', tone: 'bg-amber-400/15 text-amber-200 ring-amber-300/30' },
  expired: { label: 'Berakhir', tone: 'bg-red-400/15 text-red-200 ring-red-300/30' },
  none: { label: 'Belum aktif', tone: 'bg-white/10 text-gray-200 ring-white/20' },
}

export default async function BillingPage() {
  const { billing, access } = await getCurrentOwnerAccess()
  const sub = billing?.subscription
  const checkout = billing?.open_checkout
  const plans = billing?.plans ?? []
  const renewing = !!sub?.renewal_enabled && (sub.status === 'active' || sub.status === 'past_due')
  const canChoosePlan = !checkout && !renewing && !(sub?.status === 'active' && access.state === 'active')
  const state = STATE_LABEL[access.state]

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Sistem & Akun" title="Langganan" description="Satu langganan berlaku untuk semua cabang dan perangkat kasir Anda." />

      {!billingEnabled() ? (
        <Notice tone="info">{BILLING_DISABLED_MESSAGE}</Notice>
      ) : !billing ? (
        <Notice tone="warning" role="alert">Status langganan belum dapat dimuat. Muat ulang halaman beberapa saat lagi.</Notice>
      ) : (
        <>
          <section aria-label="Status langganan" className="relative overflow-hidden rounded-3xl bg-espresso-900 text-white shadow-lg">
            <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-champagne/20 blur-3xl" />
            <div className="relative grid gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div>
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${state.tone}`}>{state.label}</span>
                <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-gray-200">{accessMessage(access)}</p>
              </div>
              {access.endsAt && (
                <div className="rounded-2xl bg-white/6 px-6 py-4 ring-1 ring-white/10 lg:text-right">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">{access.state === 'trial' ? 'Trial berakhir' : 'Aktif sampai'}</p>
                  <p className="mt-1 font-display text-2xl font-semibold text-champagne">{formatDateTime(access.endsAt)}</p>
                  {access.daysLeft > 0 && <p className="mt-0.5 text-xs text-gray-400">{access.daysLeft} hari lagi</p>}
                </div>
              )}
            </div>
            <dl className="relative grid border-t border-white/10 sm:grid-cols-3">
              {[
                { label: 'Paket', value: sub && sub.status !== 'pending' ? `${sub.plan_name} · ${rupiah(sub.amount)}` : access.tester ? 'Akses penguji (gratis)' : access.state === 'trial' ? 'Trial 14 hari' : '-' },
                { label: 'Perpanjangan otomatis', value: renewing ? `Aktif · tagihan berikutnya ${formatDateTime(sub?.next_billing_at)}` : 'Tidak aktif' },
                { label: 'Toleransi setelah berakhir', value: `${GRACE_DAYS} hari` },
              ].map(item => (
                <div key={item.label} className="border-white/10 px-6 py-4 max-sm:border-b sm:border-r sm:px-8 sm:last:border-r-0">
                  <dt className="text-xs text-gray-400">{item.label}</dt>
                  <dd className="mt-1 text-sm font-semibold text-white">{item.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          {(checkout?.checkout_url || checkout || sub?.xendit_plan_id || renewing) && (
            <Panel title="Tindakan" description="Kelola pembayaran dan perpanjangan langganan.">
              <div className="flex flex-wrap gap-3">
                {checkout?.checkout_url && (
                  <a href={checkout.checkout_url} className={ui.btnPrimary}>
                    <CreditCard className="h-4 w-4" aria-hidden="true" />Lanjutkan Pembayaran {checkout.plan_name} ({rupiah(checkout.amount)})
                  </a>
                )}
                {(checkout || sub?.xendit_plan_id) && (
                  <BillingActionButton action={checkPaymentStatus} label="Cek Status Pembayaran" pendingLabel="Memeriksa..." />
                )}
                {renewing && (
                  <BillingActionButton action={cancelAutoRenewal} label="Hentikan Perpanjangan Otomatis" pendingLabel="Menghentikan..." danger
                    confirmText="Hentikan perpanjangan otomatis? Langganan tetap aktif sampai akhir periode yang sudah dibayar." />
                )}
              </div>
              {checkout && !checkout.checkout_url && (
                <Notice tone="warning" className="mt-4">Pembayaran sebelumnya belum terkonfirmasi dari Xendit. Pilih paket yang sama untuk melanjutkan tanpa tagihan ganda.</Notice>
              )}
            </Panel>
          )}

          {(canChoosePlan || (checkout && !checkout.checkout_url)) && (
            <section aria-labelledby="plans-title" className="space-y-4">
              <div>
                <h2 id="plans-title" className="font-display text-2xl font-semibold text-gray-900">Pilih paket</h2>
                <p className="mt-1 text-sm text-gray-500">Semua paket membuka seluruh fitur KasirKu.</p>
              </div>
              {plans.length === 0 ? (
                <Notice>Paket langganan belum tersedia. Hubungi admin KasirKu.</Notice>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {plans.map(plan => {
                    const monthly = plan.interval_months > 1 ? Math.round(plan.amount / plan.interval_months) : null
                    const monthlyPlan = plans.find(p => p.interval_months === 1)
                    const saving = monthly && monthlyPlan ? monthlyPlan.amount * plan.interval_months - plan.amount : 0
                    const featured = saving > 0
                    return (
                      <div key={plan.code} className={`relative flex flex-col overflow-hidden rounded-3xl p-7 ${featured ? 'bg-espresso-900 text-white shadow-xl ring-1 ring-champagne/30' : 'border border-gray-200/70 bg-white shadow-sm'}`}>
                        {featured && <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-champagne/20 blur-3xl" />}
                        <div className="relative flex items-center justify-between gap-2">
                          <h3 className={`text-sm font-semibold uppercase tracking-[0.14em] ${featured ? 'text-champagne' : 'text-blue-700'}`}>{plan.name}</h3>
                          {featured && <span className="rounded-full bg-champagne px-2.5 py-0.5 text-xs font-semibold text-espresso-900">Hemat {rupiah(saving)}</span>}
                        </div>
                        <p className={`relative mt-4 font-display text-4xl font-semibold tabular-nums ${featured ? 'text-white' : 'text-gray-900'}`}>{rupiah(plan.amount)}<span className={`ml-1 font-sans text-sm font-normal ${featured ? 'text-gray-400' : 'text-gray-500'}`}>/ {plan.interval_months === 1 ? 'bulan' : `${plan.interval_months} bulan`}</span></p>
                        {monthly && <p className={`relative mt-1.5 text-sm ${featured ? 'text-gray-300' : 'text-gray-500'}`}>setara {rupiah(monthly)} per bulan</p>}
                        <ul className={`relative mt-6 flex-1 space-y-2.5 text-sm ${featured ? 'text-gray-200' : 'text-gray-600'}`}>
                          {['Cabang & perangkat kasir tanpa batas', 'Laporan, stok, dan pengeluaran', 'Diperpanjang otomatis, bisa dihentikan kapan saja'].map(f => (
                            <li key={f} className="flex gap-2.5"><CheckCircle2 className={`h-4 w-4 shrink-0 ${featured ? 'text-champagne' : 'text-emerald-600'}`} aria-hidden="true" />{f}</li>
                          ))}
                        </ul>
                        <div className="relative"><PlanCheckoutButton planCode={plan.code} label={`Bayar ${plan.name}`} featured={featured} /></div>
                      </div>
                    )
                  })}
                </div>
              )}
              <p className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />Pembayaran diproses oleh Xendit. KasirKu tidak menyimpan data kartu Anda.
                {billingEnvironment() === 'test' && <Badge tone="amber">Mode Uji (Test Mode): tidak ada uang sungguhan yang ditagih.</Badge>}
              </p>
            </section>
          )}

          <Notice tone="info">
            <p className="flex items-center gap-2 font-semibold"><CalendarClock className="h-4 w-4" aria-hidden="true" />Bila langganan berakhir</p>
            <p className="mt-1 leading-relaxed">Selama {GRACE_DAYS} hari setelah berakhir, semua fitur tetap jalan. Setelah itu dashboard menjadi hanya-baca (laporan dan backup tetap bisa dibuka) dan kasir tidak bisa membuat transaksi baru. Transaksi yang sudah tercatat di kasir tetap tersinkron dan tidak hilang. Begitu pembayaran berhasil, semua fitur langsung aktif kembali.</p>
          </Notice>
        </>
      )}
    </div>
  )
}
