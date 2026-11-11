import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import {
  BACKUP_COLUMNS, BACKUP_DATASETS, BACKUP_TIMEZONE,
  backupDayBoundary, csvLine, isBackupDataset, validateBackupFilters,
  type BackupDataset, type BackupFilters, type BackupRow,
} from '@/lib/backup'

export const dynamic = 'force-dynamic'

type Business = {
  id: string
  name: string
  owner_id: string
  address: string | null
  created_at: string
  last_synced_at: string | null
  last_device_code: string | null
  pos_config: unknown
  pos_config_updated_at: string | null
}
type ExportContext = { db: SupabaseClient; businesses: Business[]; filters: BackupFilters; signal: AbortSignal }

/** Cursor memakai seluruh primary key, sehingga ID sama di cabang lain tetap terambil. */
function afterCursor(columns: string[], row: BackupRow): string {
  return columns.map((column, index) => {
    const previous = columns.slice(0, index).map((key) => `${key}.eq.${JSON.stringify(String(row[key]))}`)
    const greater = `${column}.gt.${JSON.stringify(String(row[column]))}`
    return previous.length ? `and(${[...previous, greater].join(',')})` : greater
  }).join(',')
}

async function* datasetRows(dataset: BackupDataset, context: ExportContext): AsyncGenerator<BackupRow> {
  const { db, businesses, filters, signal } = context
  const menu = new Map<string, BackupRow>()
  if (dataset === 'products') {
    for (const business of businesses) {
      const config = business.pos_config as { products?: unknown[] } | null
      for (const item of Array.isArray(config?.products) ? config.products : []) {
        if (item && typeof item === 'object' && typeof (item as BackupRow).id === 'string') {
          menu.set(`${business.id}:${(item as BackupRow).id}`, item as BackupRow)
        }
      }
    }
  }
  if (dataset === 'businesses' || dataset === 'pos_config') {
    for (const business of businesses) {
      const row: BackupRow = { ...business }
      if (dataset === 'businesses') {
        delete row.pos_config
        delete row.pos_config_updated_at
        yield row
      } else {
        yield { business_id: business.id, pos_config: business.pos_config, pos_config_updated_at: business.pos_config_updated_at }
      }
    }
    return
  }

  const order = dataset === 'deleted_records' ? ['business_id', 'kind', 'id'] : ['business_id', 'id']
  // Kelompok cabang membatasi panjang URL. Tidak ada kueri per cabang atau per baris.
  for (let offset = 0; offset < businesses.length; offset += 100) {
    const businessIds = businesses.slice(offset, offset + 100).map((business) => business.id)
    let cursor: BackupRow | null = null
    while (true) {
      let query = db.from(dataset).select('*').in('business_id', businessIds).limit(500).abortSignal(signal)
      for (const column of order) query = query.order(column)
      if (cursor) query = query.or(afterCursor(order, cursor))

      if (dataset === 'expenses' || dataset === 'manual_summaries') {
        const periodColumn = dataset === 'expenses' ? 'scope' : 'period'
        const monthly = [`${periodColumn}.eq.${dataset === 'expenses' ? 'monthly' : 'month'}`]
        const daily = [`${periodColumn}.eq.${dataset === 'expenses' ? 'daily' : 'day'}`]
        if (filters.start) {
          monthly.push(`date.gte.${filters.start.slice(0, 7)}`)
          daily.push(`date.gte.${filters.start}`)
        }
        if (filters.end) {
          monthly.push(`date.lte.${filters.end.slice(0, 7)}`)
          daily.push(`date.lte.${filters.end}`)
        }
        if (filters.start || filters.end) query = query.or(`and(${monthly.join(',')}),and(${daily.join(',')})`)
      } else if (dataset !== 'products') {
        const column = { transactions: 'created_at', shifts: 'start_time', book_period_rules: 'effective_from', deleted_records: 'deleted_at' }[dataset]
        if (filters.start) query = query.gte(column, dataset === 'book_period_rules' ? filters.start : backupDayBoundary(filters.start))
        if (filters.end) {
          query = dataset === 'book_period_rules'
            ? query.lte(column, filters.end)
            : query.lt(column, backupDayBoundary(filters.end, true))
        }
      }

      const { data, error } = await query
      if (error) throw new Error(`Gagal mengambil ${dataset}.`)
      if (!data?.length) break
      for (const row of data) {
        if (dataset !== 'products') { yield row as BackupRow; continue }
        const stored = row.raw && typeof row.raw === 'object' ? row.raw as BackupRow : {}
        const latest = { ...(menu.get(`${row.business_id}:${row.id}`) ?? {}) }
        delete latest._inventory
        // POS options are current in pos_config; keep the private admin journal
        // from products and operational values from their typed columns.
        const raw = { ...stored, ...latest, id: row.id, name: row.name, categoryId: row.category_id,
          price: row.price, costPrice: row.cost_price, stock: row.stock, isAvailable: row.is_available }
        yield { ...row, raw } as BackupRow
      }
      cursor = data[data.length - 1] as BackupRow
    }
  }
}

async function* jsonExport(datasets: BackupDataset[], context: ExportContext): AsyncGenerator<string> {
  const counts: Partial<Record<BackupDataset, number>> = {}
  const metadata = {
    version: 1,
    exportedAt: new Date().toISOString(),
    timezone: BACKUP_TIMEZONE,
    filters: context.filters,
    businesses: context.businesses.map(({ id, name }) => ({ id, name })),
    datasets,
    omittedFields: ['businesses.sync_token'],
  }
  yield JSON.stringify(metadata).slice(0, -1) + ',"data":{'
  for (const [index, dataset] of datasets.entries()) {
    yield `${index ? ',' : ''}${JSON.stringify(dataset)}:[`
    let count = 0
    for await (const row of datasetRows(dataset, context)) {
      yield `${count ? ',' : ''}${JSON.stringify(row)}`
      count++
    }
    counts[dataset] = count
    yield ']'
  }
  yield `},"counts":${JSON.stringify(counts)}}`
}

async function* csvExport(dataset: BackupDataset, context: ExportContext, itemsOnly: boolean): AsyncGenerator<string> {
  const itemColumns = ['business_id', 'transaction_id', 'created_at', 'item_index', 'product_id', 'product_name', 'quantity', 'unit_price', 'total_price', 'item']
  let columns = itemsOnly ? itemColumns : BACKUP_COLUMNS[dataset]
  let headerWritten = false
  yield '\uFEFF'
  for await (const row of datasetRows(dataset, context)) {
    if (!headerWritten) {
      if (!itemsOnly) columns = [...new Set([...columns, ...Object.keys(row)])]
      yield csvLine(columns)
      headerWritten = true
    }
    if (itemsOnly) {
      const items = Array.isArray(row.items) ? row.items : []
      for (const [index, item] of items.entries()) {
        const value = item && typeof item === 'object' ? item as BackupRow : {}
        const product = value.product && typeof value.product === 'object' ? value.product as BackupRow : {}
        yield csvLine([row.business_id, row.id, row.created_at, index + 1, product.id, product.name, value.quantity, value.unitPrice, value.totalPrice, item])
      }
    } else {
      yield csvLine(columns.map((column) => row[column]))
    }
  }
  if (!headerWritten) yield csvLine(columns)
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const dataset = params.get('dataset') ?? 'all'
  const format = params.get('format') ?? 'json'
  const itemsOnly = params.get('view') === 'items'
  const filters: BackupFilters = { businessId: params.get('b') || null, start: params.get('start') ?? '', end: params.get('end') ?? '' }
  const invalid = validateBackupFilters(filters)
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })
  if ((dataset !== 'all' && !isBackupDataset(dataset)) || !['json', 'csv'].includes(format)) {
    return NextResponse.json({ error: 'Pilihan data atau format tidak valid.' }, { status: 400 })
  }
  if ((dataset === 'all' && format !== 'json') || (itemsOnly && (dataset !== 'transactions' || format !== 'csv'))) {
    return NextResponse.json({ error: 'Format unduhan tidak sesuai dengan pilihan data.' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Silakan login kembali untuk mengunduh backup.' }, { status: 401 })
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Key server untuk backup belum dikonfigurasi.' }, { status: 503 })
  }

  // Otorisasi seluruh cabang sebelum client admin digunakan, termasuk tabel tanpa policy baca owner.
  const businesses: Business[] = []
  let lastId: string | undefined
  while (true) {
    let query = supabase.from('businesses')
      .select('id, owner_id, name, address, created_at, last_synced_at, last_device_code, pos_config, pos_config_updated_at')
      .eq('owner_id', user.id).order('id').limit(500).abortSignal(request.signal)
    if (filters.businessId) query = query.eq('id', filters.businessId)
    if (lastId) query = query.gt('id', lastId)
    const { data, error } = await query
    if (error) return NextResponse.json({ error: 'Gagal memeriksa cabang untuk backup.' }, { status: 500 })
    if (!data?.length) break
    businesses.push(...data)
    lastId = data[data.length - 1].id
  }
  if (!businesses.length) return NextResponse.json({ error: 'Cabang tidak tersedia untuk akun ini.' }, { status: 404 })

  const context: ExportContext = { db: createAdminClient(), businesses, filters, signal: request.signal }
  const datasets = dataset === 'all' ? BACKUP_DATASETS.map((entry) => entry.id) : [dataset as BackupDataset]
  const iterator = format === 'json' ? jsonExport(datasets, context) : csvExport(dataset as BackupDataset, context, itemsOnly)
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await iterator.next()
        if (chunk.done) controller.close()
        else controller.enqueue(encoder.encode(chunk.value))
      } catch (error) {
        console.error('backup export failed', error)
        controller.error(new Error('Backup gagal diunduh. Silakan coba lagi.'))
      }
    },
    async cancel() { await iterator.return(undefined) },
  })
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filename = `backup-${dataset}${itemsOnly ? '-items' : ''}-${timestamp}.${format}`
  return new Response(stream, {
    headers: {
      'Content-Type': format === 'json' ? 'application/json; charset=utf-8' : 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
      'Vary': 'Cookie',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
