import DataPanel from '@/components/DataPanel'
import Link from '@/components/LoadingLink'
import { Wallet, CalendarDays, CalendarRange, Archive, X } from 'lucide-react'
import { Badge, EmptyState, Notice, Panel, StatCard, ui } from '@/components/ui'
import { getBusinessContext, EMPTY_BUSINESS_ID } from '@/lib/business-context'
import { rupiah, formatDateTime } from '@/lib/format'
import { anchorDate, formatRange } from '@/lib/book-period'
import { resolvePeriod, fetchAll } from '@/lib/report-period'
import PeriodSelect from '../PeriodSelect'
import ExpenseEntry from './ExpenseEntry'
import ExpenseActions from './ExpenseActions'
import ExpenseExport from './ExpenseExport'
import { expenseNoteSuggestions } from '../../../../../shared/expense-products'

type Exp = {
  id: string
  scope: string
  date: string
  category: string | null
  amount: number | string
  note: string | null
  from_drawer: boolean
  salary_payment_id: string | null
  created_by: string | null
  created_at: string | null
  product_name: string | null
  quantity: number | string | null
  unit_label: string | null
  entry_group_id: string | null
  supplier_name: string | null
  synced_at: string
  purchase_line_id: string | null
  shift_id: string | null
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
  const { supabase, businessId, businesses: ownedBusinesses } = await getBusinessContext()
  const businesses = ownedBusinesses.filter(b => b.id === businessId)
  const scopedBusinessId = businessId ?? EMPTY_BUSINESS_ID
  const { start, end, options } = await resolvePeriod(supabase, scopedBusinessId, businesses, sp.p)

  const res = await fetchAll<Exp>((from, to) => {
    let q = supabase
      .from('expenses')
      .select('id, scope, date, category, amount, note, from_drawer, created_by, created_at, product_name, quantity, unit_label, entry_group_id, supplier_name, synced_at, purchase_line_id, salary_payment_id, shift_id, businesses(name)')
      .gte('date', start.slice(0, 7))
      .lte('date', end)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to)
    q = q.eq('business_id', scopedBusinessId)
    return q
  })
  const inPeriod = res.data.filter((e) => {
    const a = anchorDate(e.date)
    return a >= start && a <= end
  })
  const catKey = (e: Exp) => e.category?.trim() || 'Lain-lain'
  const cat = sp.cat ?? ''
  const shown = cat ? inPeriod.filter((e) => catKey(e) === cat) : inPeriod
  const recentNotes = expenseNoteSuggestions(inPeriod.filter(expense => !expense.product_name).map(expense => expense.note), '', 100)

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

  // Product lines entered together share one purchase document.
  const purchaseDocs = new Map<string, { name: string; amount: number }[]>()
  for (const e of res.data) if (e.purchase_line_id && e.entry_group_id) {
    const list = purchaseDocs.get(e.entry_group_id) ?? []
    list.push({ name: e.product_name || e.note || catKey(e), amount: n(e.amount) }); purchaseDocs.set(e.entry_group_id, list)
  }

  const showBiz = false
  const href = (c: string) => {
    const q = new URLSearchParams({ p: `${start}_${end}` })
    if (c) q.set('cat', c)
    return `/dashboard/expenses?${q}`
  }

  return (
    <div className="space-y-6">
      <ExpenseEntry key={businessId ?? 'none'} businessId={businessId} recentNotes={recentNotes} description={<>Periode <span className="font-medium text-gray-700">{formatRange(start, end)}</span> · pengeluaran dari admin dan kasir.</>}>
        <ExpenseExport unavailable={!!res.error || !businessId} report={{ branchName: businesses[0]?.name ?? '', period: formatRange(start, end), category: cat,
          rows: shown.map(e => ({ id: e.id, scope: e.scope, date: e.date, category: e.category, note: e.note, amount: e.amount,
            fromDrawer: e.from_drawer, createdBy: e.created_by, createdAt: e.created_at, productName: e.product_name, quantity: e.quantity,
            unitLabel: e.unit_label, supplierName: e.supplier_name, entryGroupId: e.entry_group_id, shiftId: e.shift_id })) }} />
        <PeriodSelect options={options} value={`${start}_${end}`} />
      </ExpenseEntry>

      {res.error && <Notice tone="error">{res.error}</Notice>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Wallet} tone="red" label="Total Pengeluaran" value={rupiah(total)} hint={`${inPeriod.length} catatan`} valueClassName="text-red-600"
          info="Seluruh pengeluaran harian dan bulanan pada periode ini." />
        <StatCard icon={CalendarDays} tone="amber" label="Harian / Operasional" value={rupiah(sum(daily))} hint={`${daily.length} catatan`}
          info="Belanja bahan dan biaya operasional yang dicatat per tanggal." />
        <StatCard icon={CalendarRange} tone="sky" label="Bulanan / Biaya Tetap" value={rupiah(sum(monthly))} hint={`${monthly.length} catatan`}
          info="Biaya tetap per bulan seperti sewa, gaji, dan listrik." />
        <StatCard icon={Archive} tone="gray" label="Diambil dari Laci" value={rupiah(sum(drawer))} hint="Uang kas shift"
          info="Pengeluaran yang dibayar kasir langsung dari uang laci shift." />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel data className="self-start lg:sticky lg:top-4" title="Per Kategori" description="Klik kategori untuk menyaring daftar">
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
                      aria-current={active ? 'true' : undefined} className={'-mx-2 block rounded-xl px-3 py-2.5 transition-colors ' + (active ? 'bg-red-50 ring-1 ring-red-100' : 'hover:bg-gray-50')}
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
        </Panel>

        <section aria-label="Daftar pengeluaran" className="space-y-4 lg:col-span-2">
          {cat && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-2.5 text-sm text-red-700">
              <span>Filter kategori <b>{cat}</b> · {rupiah(sum(shown))}</span>
              <Link href={href('')} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold hover:bg-red-100"><X aria-hidden="true" className="h-3.5 w-3.5" />Hapus filter</Link>
            </div>
          )}
          {groupList.length === 0 ? (
            <DataPanel className={ui.panel}>
              <EmptyState icon={Wallet} title="Belum ada pengeluaran" description="Belum ada pengeluaran pada periode ini. Tambahkan lewat tombol Tambah Pengeluaran." />
            </DataPanel>
          ) : (
            groupList.map(([key, g]) => (
              <DataPanel key={key} className={`${ui.panel} overflow-hidden`}>
                <div className={'flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-3 ' + (key[0] === 'M' ? 'bg-sky-50/60' : 'bg-gray-50/70')}>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{g.title}</p>
                    {g.hint && <p className="text-xs text-gray-500">{g.hint}</p>}
                  </div>
                  <span className="whitespace-nowrap text-sm font-bold tabular-nums text-red-600">{rupiah(sum(g.items))}</span>
                </div>
                <ul className="divide-y divide-gray-100">
                  {g.items.map((e) => (
                    <li key={`${e.businesses?.name}-${e.id}`} className="flex justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-gray-50/50">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {e.product_name || e.note || catKey(e)}
                          {e.from_drawer && <Badge className="ml-2 align-middle">dari laci</Badge>}
                          {e.salary_payment_id && <Badge tone="sky" className="ml-2 align-middle">gaji</Badge>}
                        </p>
                        {(e.product_name || e.note) && <p className="mt-1 text-sm text-gray-700">{catKey(e)}{e.quantity != null && ` · ${e.product_name ? '' : 'Jumlah: '}${Number(e.quantity).toLocaleString('id-ID', { maximumFractionDigits: 6 })}${e.unit_label ? ` ${e.unit_label === 'l' ? 'L' : e.unit_label}` : ''}`}</p>}
                        {e.product_name && e.note && <p className="text-sm text-gray-600 break-words">{e.note}</p>}
                        {e.supplier_name && <p className="mt-1 text-xs text-gray-500">Supplier: {e.supplier_name}</p>}
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
                      <div className="flex shrink-0 items-start gap-2"><span className="whitespace-nowrap pt-2 text-sm font-semibold tabular-nums text-gray-900">{rupiah(e.amount)}</span>
                        {businessId && <ExpenseActions expense={{ id: e.id, businessId, scope: e.scope === 'monthly' ? 'monthly' : 'daily', date: e.date, category: e.category ?? '', amount: n(e.amount), note: e.note ?? '', version: e.synced_at, fromDrawer: e.from_drawer, purchaseLinked: !!e.purchase_line_id, salaryLinked: !!e.salary_payment_id, purchaseLineId: e.purchase_line_id,
                          purchaseItems: e.purchase_line_id && e.entry_group_id ? (purchaseDocs.get(e.entry_group_id) ?? []) : [],
                          financialLock: e.salary_payment_id ? 'Terkait pembayaran gaji. Di sini hanya catatan yang dapat diperbaiki. Jika nominal atau periode salah, batalkan dan catat ulang di halaman Gaji Pegawai.' : e.purchase_line_id ? 'Terkait pembelian dan stok. Di sini hanya kategori dan catatan yang dapat diperbaiki. Jika jumlah, nominal, atau tanggal salah, gunakan tombol Koreksi Pembelian.' : e.from_drawer ? 'Dari laci kasir. Kategori dan catatan dapat diperbaiki di sini; nominal dikoreksi melalui kasir pada shift asal yang masih aktif.' : null }} />}
                      </div>
                    </li>
                  ))}
                </ul>
              </DataPanel>
            ))
          )}
        </section>
      </div>
    </div>
  )
}
