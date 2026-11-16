type Row = Record<string, unknown>

export function expenseFields(row: Row) {
  return { scope: row.scope === 'monthly' ? 'monthly' : 'daily', date: String(row.date ?? ''),
    category: String(row.category ?? '').trim(), amount: Number(row.amount), note: String(row.note ?? '').trim() }
}

export function sameExpense(a: Row, b: Row) {
  return JSON.stringify(expenseFields(a)) === JSON.stringify(expenseFields(b))
}

export function validateExpense(row: Row) {
  const fields = expenseFields(row), date = fields.scope === 'monthly' ? `${fields.date}-01` : fields.date
  if (!['daily', 'monthly'].includes(String(row.scope)) || !(fields.scope === 'monthly' ? /^\d{4}-\d{2}$/ : /^\d{4}-\d{2}-\d{2}$/).test(fields.date)
    || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error('Tanggal pengeluaran tidak valid.')
  if (!Number.isFinite(fields.amount) || fields.amount <= 0 || fields.amount > 999_999_999 || Math.abs(fields.amount * 100 - Math.round(fields.amount * 100)) > 0.00001) throw new Error('Nominal harus lebih dari 0, maksimal Rp 999.999.999, dan maksimal dua angka desimal.')
  if (!fields.category || fields.category.length > 100) throw new Error('Kategori wajib diisi, maksimal 100 karakter.')
  if (fields.note.length > 500) throw new Error('Catatan maksimal 500 karakter.')
  return fields
}

export function financialChange(a: Row, b: Row) {
  return Number(a.amount) !== Number(b.amount) || a.scope !== b.scope || a.date !== b.date
}
