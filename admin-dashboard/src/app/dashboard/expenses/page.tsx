import Link from 'next/link'
import { Wallet, CalendarDays, CalendarRange, Archive } from 'lucide-react'
import { createClient } from '@/utils/supabase/server'
import { rupiah, formatDateTime } from '@/lib/format'
import { pickBusinessId } from '@/lib/business-filter'
import { anchorDate, formatRange } from '@/lib/book-period'
import { resolvePeriod, fetchAll } from '@/lib/report-period'
import BusinessSelect from '../BusinessSelect'
import PeriodSelect from '../PeriodSelect'

type Exp = {
  id: string
  scope: string
  date: string
  category: string | null
  amount: number | string
  note: string | null
  from_drawer: boolean
  created_by: string | null
  created_at: string | null
  businesses: { name: string } | null
}

const n = (v: unknown) => Number(v) || 0
const dayFmt = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const monthFmt = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const timeFmt = new Intl.DateTimeFormat('id-ID', { timeStyle: 'short', timeZone: 'Asia/Jakarta' })

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ b?: string | string[]; p?: string; cat?: string }>
}) {
  const sp = await searchParams
  const businessId = pickBusinessId(sp.b)
  const supabase = await createClient()
  const { data: businesses } = await supabase.from('businesses').select('id, name').order('created_at')
  const { start, end, options } = await resolvePeriod(supabase, businessId, businesses ?? [], sp.p)

  const res = await fetchAll<Exp>((from, to) => {
    let q = supabase
      .from('expenses')
      .select('id, scope, date, category, amount, note, from_drawer, created_by, created_at, businesses(name)')
      .gte('date', start.slice(0, 7))
      .lte('date', end)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to)
    if (businessId) q = q.eq('business_id', businessId)
    return q
  })
  const inPeriod = res.data.filter((e) => {
    const a = anchorDate(e.date)
    return a >= start && a <= end
  })
  const catKey = (e: Exp) => e.category?.trim() || 'Lainnya'
  const cat = sp.cat ?? ''
  const shown = cat ? inPeriod.filter((e) => catKey(e) === cat) : inPeriod

  const total = inPeriod.reduce((s, e) => s + n(e.amount), 0)
  const daily = inPeriod.filter((e) => e.scope !== 'monthly')
  const monthly = inPeriod.filter((e) => e.scope === 'monthly')
  const drawer = inPeriod.filter((e) => e.from_drawer)
  const sum = (xs: Exp[]) => xs.reduce((s, e) => s + n(e.amount), 0)

  const byCat = new Map<string, { total: number; count: number }>()
  for (const e of inPeriod) {
    const cur = byCat.get(catKey(e)) ?? { total: 0, count: 0 }
    byCat.set(catKey(e), { total: cur.total + n(e.amount), count: cur.count + 1 })
  }
  const categories = [...byCat].sort((a, b) => b[1].total - a[1].total)

  // Kelompokkan per tanggal; biaya bulanan dikelompokkan per bulan di atas.
  const groups = new Map<string, { title: string; hint: string; items: Exp[] }>()
  for (const e of shown) {
    const monthlyRow = e.scope === 'monthly'
    const key = monthlyRow ? `M-${e.date}` : `D-${e.date}`
    if (!groups.has(key))
      groups.set(key, {
        title: monthlyRow ? `Biaya bulanan · ${monthFmt.format(new Date(anchorDate(e.date) + 'T00:00:00Z'))}` : dayFmt.format(new Date(e.date + 'T00:00:00Z')),
        hint: monthlyRow ? 'Biaya tetap: sewa, gaji, listrik, dll.' : '',
        items: [],
      })
    groups.get(key)!.items.push(e)
  }
  const groupList = [...groups].sort(([a], [b]) => (a[0] !== b[0] ? (a[0] === 'M' ? -1 : 1) : b.localeCompare(a)))

  const showBiz = !businessId && (businesses?.length ?? 0) > 1
  const href = (c: string) => {
    const q = new URLSearchParams({ ...(businessId ? { b: businessId } : {}), p: `${start}_${end}` })
    if (c) q.set('cat', c)
    return `/dashboard/expenses?${q}`
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pengeluaran</h1>
          <p className="text-gray-500 text-sm mt-1">Periode {formatRange(start, end)} · dicatat dari aplikasi kasir.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <BusinessSelect businesses={businesses ?? []} />
          <PeriodSelect options={options} value={`${start}_${end}`} />
        </div>
      </div>

      {res.error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{res.error}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon={Wallet} label="Total Pengeluaran" value={rupiah(total)} hint={`${inPeriod.length} catatan`} tone="bg-red-50 text-red-600" />
        <Stat icon={CalendarDays} label="Harian / Operasional" value={rupiah(sum(daily))} hint={`${daily.length} catatan`} tone="bg-orange-50 text-orange-600" />
        <Stat icon={CalendarRange} label="Bulanan / Biaya Tetap" value={rupiah(sum(monthly))} hint={`${monthly.length} catatan`} tone="bg-purple-50 text-purple-600" />
        <Stat icon={Archive} label="Diambil dari Laci" value={rupiah(sum(drawer))} hint="Uang kas shift" tone="bg-gray-100 text-gray-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 self-start">
          <h2 className="font-bold text-gray-900 mb-1">Per Kategori</h2>
          <p className="text-xs text-gray-400 mb-4">Klik kategori untuk menyaring daftar.</p>
          {categories.length === 0 ? (
            <p className="text-sm text-gray-400">Belum ada pengeluaran.</p>
          ) : (
            <ul className="space-y-1">
              {categories.map(([k, v]) => {
                const pct = total > 0 ? Math.round((v.total / total) * 100) : 0
                const active = cat === k
                return (
                  <li key={k}>
                    <Link
                      href={href(active ? '' : k)}
                      className={'block rounded-lg px-2 py-2 -mx-2 ' + (active ? 'bg-red-50' : 'hover:bg-gray-50')}
                    >
                      <div className="flex justify-between gap-3 text-sm">
                        <span className={'truncate ' + (active ? 'font-semibold text-red-700' : 'text-gray-700')}>
                          {k} <span className="text-xs text-gray-400">({v.count})</span>
                        </span>
                        <span className="font-medium text-gray-900 whitespace-nowrap">
                          {rupiah(v.total)} <span className="text-xs text-gray-400 font-normal">{pct}%</span>
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full mt-1.5 overflow-hidden">
                        <div className="h-full rounded-full bg-red-400" style={{ width: `${Math.max(pct, 2)}%` }} />
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="lg:col-span-2 space-y-3">
          {cat && (
            <div className="flex items-center justify-between bg-red-50 text-red-700 text-sm rounded-lg px-4 py-2">
              <span>
                Kategori <b>{cat}</b>: {rupiah(sum(shown))}
              </span>
              <Link href={href('')} className="underline">
                Tampilkan semua
              </Link>
            </div>
          )}
          {groupList.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-500">
              Belum ada pengeluaran pada periode ini.
            </div>
          ) : (
            groupList.map(([key, g]) => (
              <div key={key} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className={'flex justify-between items-center gap-3 px-4 py-2.5 border-b border-gray-100 ' + (key[0] === 'M' ? 'bg-purple-50/60' : 'bg-gray-50')}>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{g.title}</p>
                    {g.hint && <p className="text-xs text-gray-500">{g.hint}</p>}
                  </div>
                  <span className="text-sm font-bold text-red-600 whitespace-nowrap">{rupiah(sum(g.items))}</span>
                </div>
                <ul className="divide-y divide-gray-100">
                  {g.items.map((e) => (
                    <li key={`${e.businesses?.name}-${e.id}`} className="flex justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {catKey(e)}
                          {e.from_drawer && <span className="ml-2 text-xs font-normal px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">dari laci</span>}
                        </p>
                        {e.note && <p className="text-sm text-gray-600 break-words">{e.note}</p>}
                        <p className="text-xs text-gray-400 mt-0.5">
                          {[
                            e.created_by,
                            e.created_at ? (e.scope === 'monthly' ? formatDateTime(e.created_at) : timeFmt.format(new Date(e.created_at))) : null,
                            showBiz ? e.businesses?.name : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-gray-900 whitespace-nowrap">{rupiah(e.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  )
}

function Stat({ icon: Icon, label, value, hint, tone }: { icon: typeof Wallet; label: string; value: string; hint: string; tone: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 min-w-0">
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${tone}`}>
          <Icon className="w-4 h-4" />
        </span>
        <p className="text-xs font-medium text-gray-500 truncate">{label}</p>
      </div>
      <p className="text-lg font-bold text-gray-900 truncate">{value}</p>
      <p className="text-xs text-gray-400">{hint}</p>
    </div>
  )
}
