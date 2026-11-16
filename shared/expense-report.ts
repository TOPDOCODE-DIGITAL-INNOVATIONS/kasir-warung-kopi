/** Shared by the two apps; works with their existing data without another query. */
export type ExpenseReportRow = {
  id: string; scope: string; date: string; category?: string | null; note?: string | null
  amount: number | string; fromDrawer?: boolean; createdBy?: string | null; createdAt?: string | null
  productName?: string | null; quantity?: number | string | null; unitLabel?: string | null
  supplierName?: string | null; entryGroupId?: string | null; shiftId?: string | null
}

export type ExpenseReport = {
  rows: ExpenseReportRow[]; branchName: string; period: string; category?: string
}

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
const day = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
const month = new Intl.DateTimeFormat('id-ID', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const dateTime = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })
const currency = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 2 })
const anchor = (date: string) => date.length === 7 ? `${date}-01` : date
const small = (text: string) => text ? `<span class="detail">${escape(text)}</span>` : ''

function dateLabel(row: ExpenseReportRow) {
  const date = new Date(`${anchor(row.date)}T00:00:00Z`)
  return Number.isFinite(date.getTime()) ? (row.scope === 'monthly' ? month : day).format(date) : row.date
}

/** Oldest first; ties use creation time and ID so pagination is deterministic. */
export function expenseReportRows(rows: ExpenseReportRow[]) {
  return [...rows].sort((a, b) => anchor(a.date).localeCompare(anchor(b.date))
    || (Date.parse(a.createdAt ?? '') || 0) - (Date.parse(b.createdAt ?? '') || 0)
    || a.id.localeCompare(b.id))
}

export function buildExpenseReport(report: ExpenseReport) {
  const rows = expenseReportRows(report.rows)
  // Sum in cents so 0.1 + 0.2 does not produce a floating-point display error.
  const total = rows.reduce((sum, row) => sum + Math.round((Number(row.amount) || 0) * 100), 0) / 100
  const title = `Pengeluaran - ${report.branchName} - ${report.period}`
  const table = rows.map((row, index) => {
    const category = row.category?.trim() || 'Lainnya'
    const purchase = row.note?.trim() || category
    const quantity = row.quantity == null ? '' : `${Number(row.quantity).toLocaleString('id-ID', { maximumFractionDigits: 6 })} ${row.unitLabel === 'l' ? 'L' : row.unitLabel ?? ''}`.trim()
    const created = row.createdAt && Number.isFinite(Date.parse(row.createdAt)) ? `${dateTime.format(new Date(row.createdAt))} WIB` : ''
    return `<tr><td class="number">${index + 1}</td><td>${escape(dateLabel(row))}</td><td>${row.scope === 'monthly' ? 'Bulanan' : 'Harian'}</td><td>${escape(category)}</td>
      <td><strong>${escape(purchase)}</strong>${small(`ID: ${row.id}`)}${row.entryGroupId ? small(`Kelompok: ${row.entryGroupId}`) : ''}</td>
      <td>${escape(row.productName || '-')}${quantity ? small(quantity) : ''}</td><td>${escape(row.supplierName || '-')}</td>
      <td class="money">${escape(currency.format(Number(row.amount) || 0))}</td><td>${row.fromDrawer ? 'Laci kasir' : 'Di luar laci'}${row.shiftId ? small(`Shift: ${row.shiftId}`) : ''}</td>
      <td>${escape(row.createdBy || '-')}${small(created)}</td></tr>`
  }).join('')
  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)}</title>
    <style>
      @page { size: A4 landscape; margin: 12mm 10mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #172033; background: white; font: 10px/1.45 Arial, sans-serif; }
      h1 { margin: 0 0 5px; font-size: 20px; letter-spacing: -.3px; }
      .heading { margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #2563eb; }
      .branch { font-size: 12px; font-weight: bold; margin-bottom: 3px; }
      .meta { color: #596579; margin: 2px 0; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      th, td { border: 1px solid #d6dde7; padding: 7px 6px; vertical-align: top; overflow-wrap: anywhere; word-break: normal; }
      th { background: #eef3fa; color: #26374e; font-size: 9px; text-align: left; }
      thead { display: table-header-group; }
      tbody tr:nth-child(even) { background: #f8fafc; }
      tr { break-inside: avoid; page-break-inside: avoid; }
      .number { text-align: center; }
      .money { text-align: right; font-variant-numeric: tabular-nums; }
      .detail { display: block; margin-top: 4px; color: #64748b; font-size: 8px; overflow-wrap: anywhere; }
      .total { margin: 10px 0 0 auto; width: 280px; padding: 10px 12px; border: 1px solid #d6dde7; background: #eef3fa; break-inside: avoid; text-align: right; }
      .total strong { margin-left: 20px; font-size: 12px; }
      .footnote { color: #64748b; margin-top: 12px; font-size: 8px; }
      @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
    </style></head><body>
    <header class="heading"><h1>Laporan Pengeluaran</h1><div class="branch">${escape(report.branchName)}</div><p class="meta">Periode: ${escape(report.period)}</p><p class="meta">Kategori: ${escape(report.category || 'Semua kategori')} | ${rows.length.toLocaleString('id-ID')} catatan | Urutan tanggal: paling awal</p></header>
    <table aria-label="Tabel pengeluaran"><colgroup>${[3, 8, 7, 9, 22, 12, 9, 10, 9, 11].map(width => `<col style="width:${width}%">`).join('')}</colgroup>
    <thead><tr><th>No.</th><th>Tanggal</th><th>Jenis</th><th>Kategori</th><th>Pembelian</th><th>Produk / Jumlah</th><th>Supplier</th><th class="money">Nominal</th><th>Sumber Dana</th><th>Pencatat</th></tr></thead>
    <tbody>${table || '<tr><td colspan="10">Tidak ada pengeluaran pada filter ini.</td></tr>'}</tbody></table>
    <div class="total">Total Pengeluaran<strong>${escape(currency.format(total))}</strong></div>
    <p class="footnote">Biaya bulanan ditampilkan berdasarkan bulannya dan diurutkan pada tanggal 1. Waktu pencatatan menggunakan WIB. Nominal adalah total pengeluaran per catatan.</p>
    </body></html>`
  return { html, title, count: rows.length, total }
}

/** Isolate the report from app navigation; the user chooses Save as PDF. */
export function printExpenseReport(report: ExpenseReport): Promise<void> {
  const { html, title } = buildExpenseReport(report)
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe'), previousTitle = document.title
    frame.title = 'Pratinjau PDF pengeluaran'
    frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1123px;height:794px;border:0;'
    let timer: ReturnType<typeof setTimeout>
    const cleanup = () => { clearTimeout(timer); frame.remove(); if (document.title === title) document.title = previousTitle }
    frame.onload = async () => {
      try {
        if (!frame.contentWindow || !frame.contentDocument) throw new Error('Pratinjau PDF tidak dapat dibuka.')
        await frame.contentDocument.fonts?.ready
        frame.contentWindow.addEventListener('afterprint', cleanup, { once: true })
        document.title = title
        frame.contentWindow.focus(); frame.contentWindow.print()
        resolve()
      } catch (error) { cleanup(); reject(error) }
    }
    // Keep the document around if a browser's print dialog is asynchronous.
    timer = setTimeout(cleanup, 10 * 60 * 1000)
    frame.srcdoc = html
    document.body.appendChild(frame)
  })
}
