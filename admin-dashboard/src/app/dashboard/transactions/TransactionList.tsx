'use client'

import { useEffect, useState } from 'react'
import { X, ChevronRight, User, Store, Clock, ShoppingBag, StickyNote, History, ReceiptText } from 'lucide-react'
import { formatDateTime, rupiah, PAYMENT_LABELS } from '@/lib/format'
import type { TxRow, TxItem } from './types'
import DataPanel from '@/components/DataPanel'
import { EmptyState } from '@/components/ui'

const num = (v: number | string | null | undefined) => Number(v) || 0

function itemCount(tx: TxRow) {
  return (tx.items ?? []).reduce((s, i) => s + (i.quantity ?? 1), 0)
}

function itemSummary(tx: TxRow) {
  return (tx.items ?? []).map((i) => `${i.product?.name ?? '?'} x${i.quantity ?? 1}`).join(', ')
}

export function StatusBadge({ tx }: { tx: TxRow }) {
  if (tx.status === 'cancelled')
    return <span className="inline-flex rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold text-red-700 ring-1 ring-inset ring-red-100">Batal</span>
  if (tx.payment_type === 'hutang')
    return (
      <span
        className={
          'inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ' +
          (tx.debt_status === 'paid' ? 'bg-emerald-50 text-emerald-700 ring-emerald-100' : 'bg-amber-50 text-amber-700 ring-amber-100')
        }
      >
        Bon {tx.debt_status === 'paid' ? 'Lunas' : 'Belum Lunas'}
      </span>
    )
  return (
    <span className="inline-flex rounded-full bg-gray-50 px-2.5 py-0.5 text-[11px] font-semibold text-gray-700 ring-1 ring-inset ring-gray-200">
      {PAYMENT_LABELS[tx.payment_type ?? ''] ?? tx.payment_type ?? '-'}
      {tx.payment_detail ? ` · ${tx.payment_detail}` : ''}
    </span>
  )
}

export default function TransactionList({
  transactions,
  showBusiness,
  compact = false,
}: {
  transactions: TxRow[]
  showBusiness: boolean
  compact?: boolean
}) {
  const [selected, setSelected] = useState<TxRow | null>(null)

  if (transactions.length === 0) {
    return <DataPanel label="Memuat transaksi..."><EmptyState icon={ReceiptText} title="Belum ada transaksi" description="Transaksi kasir yang sudah tersinkron akan tampil di sini." /></DataPanel>
  }

  return (
    <DataPanel label="Memuat transaksi...">
      {/* Desktop: tabel */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left text-sm text-gray-600">
          <thead className="border-b border-gray-100 bg-gray-50/70 text-[11px] uppercase tracking-[0.08em] text-gray-500">
            <tr>
              <th className="px-5 py-3 font-semibold">Waktu</th>
              <th className="px-5 py-3 font-semibold">No. Nota</th>
              {showBusiness && <th className="px-5 py-3 font-semibold">Cabang</th>}
              <th className="px-5 py-3 font-semibold">Pelanggan / Kasir</th>
              {!compact && <th className="px-5 py-3 font-semibold">Pesanan</th>}
              <th className="px-5 py-3 font-semibold">Bayar</th>
              <th className="px-5 py-3 font-semibold text-right">Total</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {transactions.map((tx) => {
              const cancelled = tx.status === 'cancelled'
              return (
                <tr
                  key={tx.id + (tx.businesses?.name ?? '')}
                  onClick={() => setSelected(tx)}
                  className={'group cursor-pointer transition-colors ' + (cancelled ? 'bg-red-50/30 text-gray-400 hover:bg-red-50/60' : 'hover:bg-blue-50/40')}
                >
                  <td className="px-5 py-3.5 whitespace-nowrap text-gray-900">{formatDateTime(tx.created_at)}</td>
                  <td className="px-5 py-3.5 whitespace-nowrap font-mono text-xs">{tx.id}</td>
                  {showBusiness && <td className="px-5 py-3.5">{tx.businesses?.name ?? '-'}</td>}
                  <td className="px-5 py-3.5">
                    <p className="text-gray-900">{tx.customer_name || tx.order_type || '-'}</p>
                    <p className="text-xs text-gray-400">{tx.cashier_name ?? '-'}</p>
                  </td>
                  {!compact && (
                    <td className="px-5 py-3.5 text-xs max-w-xs">
                      <p className="truncate">{itemSummary(tx)}</p>
                      <p className="text-gray-400">{itemCount(tx)} item</p>
                    </td>
                  )}
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <StatusBadge tx={tx} />
                  </td>
                  <td className={'px-4 py-3 text-right font-semibold whitespace-nowrap ' + (cancelled ? 'line-through' : 'text-gray-900')}>
                    {rupiah(tx.grand_total)}
                  </td>
                  <td className="pr-4 text-gray-300 transition-colors group-hover:text-blue-600">
                    <ChevronRight className="w-4 h-4" />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: kartu */}
      <ul className="md:hidden divide-y divide-gray-100">
        {transactions.map((tx) => {
          const cancelled = tx.status === 'cancelled'
          return (
            <li key={tx.id + (tx.businesses?.name ?? '')}>
              <button
                onClick={() => setSelected(tx)}
                className={'w-full text-left px-4 py-3 flex items-center gap-3 ' + (cancelled ? 'bg-red-50/40' : 'active:bg-gray-50')}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-gray-500 truncate">{tx.id}</span>
                    <span className={'font-semibold whitespace-nowrap ' + (cancelled ? 'line-through text-gray-400' : 'text-gray-900')}>
                      {rupiah(tx.grand_total)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 truncate mt-0.5">{itemSummary(tx)}</p>
                  <div className="flex items-center justify-between gap-2 mt-1">
                    <span className="text-xs text-gray-400">
                      {formatDateTime(tx.created_at)}
                      {showBusiness && tx.businesses?.name ? ` · ${tx.businesses.name}` : ''}
                    </span>
                    <StatusBadge tx={tx} />
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
              </button>
            </li>
          )
        })}
      </ul>

      {selected && <TransactionDetail tx={selected} onClose={() => setSelected(null)} />}
    </DataPanel>
  )
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return (
    <div className={'flex justify-between gap-4 ' + (strong ? 'text-base font-bold text-gray-900' : 'text-sm text-gray-600')}>
      <span>{label}</span>
      <span className={tone}>{value}</span>
    </div>
  )
}

function Meta({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <Icon className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-sm text-gray-900 truncate">{value}</p>
      </div>
    </div>
  )
}

function ItemLine({ item }: { item: TxItem }) {
  const qty = item.quantity ?? 1
  const unit = item.unitPrice ?? item.product?.price ?? 0
  const total = item.totalPrice ?? unit * qty
  const options = (item.selectedOptions ?? []).filter((o) => o.choiceLabel)
  return (
    <li className="py-3 flex justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900">{item.product?.name ?? 'Produk'}</p>
        <p className="text-xs text-gray-500">
          {qty} × {rupiah(unit)}
        </p>
        {options.length > 0 && (
          <p className="text-xs text-gray-500 mt-0.5">
            {options
              .map((o) => `${o.groupName ? o.groupName + ': ' : ''}${o.choiceLabel}${o.extraPrice ? ` (+${rupiah(o.extraPrice)})` : ''}`)
              .join(' · ')}
          </p>
        )}
        {item.notes && <p className="text-xs text-amber-700 mt-0.5">Catatan: {item.notes}</p>}
      </div>
      <span className="text-sm font-medium text-gray-900 whitespace-nowrap">{rupiah(total)}</span>
    </li>
  )
}

function TransactionDetail({ tx, onClose }: { tx: TxRow; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const cancelled = tx.status === 'cancelled'
  const items = tx.items ?? []
  const discount = num(tx.discount_amount)
  const tax = num(tx.tax_amount)
  const overpay = num(tx.overpay_amount)
  const change = num(tx.change_amount)
  const isDebt = tx.payment_type === 'hutang'
  const edits = Array.isArray(tx.edit_history) ? tx.edit_history : []

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-espresso-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col bg-white shadow-xl sm:rounded-l-3xl sm:overflow-hidden">
        <div className="flex items-start justify-between gap-3 bg-espresso-900 px-6 py-5 text-white">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-champagne">Detail Pesanan</p>
            <h2 className="mt-1 break-all font-mono text-sm font-semibold text-white">{tx.id}</h2>
            <p className={'mt-2 font-display text-3xl font-semibold tabular-nums ' + (cancelled ? 'text-gray-400 line-through' : '')}>{rupiah(tx.grand_total)}</p>
            <div className="mt-1.5">
              <StatusBadge tx={tx} />
            </div>
          </div>
          <button onClick={onClose} className="-mr-2 rounded-lg p-2 text-gray-400 hover:bg-white/10 hover:text-white" aria-label="Tutup">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {cancelled && (
            <div className="bg-red-50 text-red-700 text-sm rounded-lg p-3">
              <p className="font-semibold">Transaksi dibatalkan</p>
              {tx.cancel_reason && <p>Alasan: {tx.cancel_reason}</p>}
              <p className="text-xs mt-1">
                {formatDateTime(tx.cancelled_at)}
                {tx.cancelled_by ? ` · oleh ${tx.cancelled_by}` : ''}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100">
            <Meta icon={Clock} label="Waktu" value={formatDateTime(tx.created_at)} />
            <Meta icon={ShoppingBag} label="Tipe Pesanan" value={tx.order_type ?? '-'} />
            <Meta icon={User} label="Pelanggan" value={[tx.customer_name, tx.customer_phone].filter(Boolean).join(' · ') || '-'} />
            <Meta icon={User} label="Kasir" value={tx.cashier_name ?? '-'} />
            <Meta icon={Store} label="Cabang" value={tx.businesses?.name ?? '-'} />
            {tx.device_code && <Meta icon={Store} label="Perangkat" value={tx.device_code} />}
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase text-gray-500 mb-1">Item ({items.length})</h3>
            {items.length === 0 ? (
              <p className="text-sm text-gray-500 py-2">Tidak ada data item.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {items.map((item, i) => (
                  <ItemLine key={i} item={item} />
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-1.5 border-t border-dashed border-gray-200 pt-3">
            <Row label="Subtotal" value={rupiah(tx.subtotal)} />
            {discount > 0 && (
              <Row label={`Diskon${tx.discount_reason ? ` (${tx.discount_reason})` : ''}`} value={`- ${rupiah(discount)}`} tone="text-red-600" />
            )}
            {tax > 0 && <Row label="Pajak" value={rupiah(tax)} />}
            <Row label="Total" value={rupiah(tx.grand_total)} strong />
          </div>

          <div className="space-y-1.5 rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100">
            <Row
              label="Metode"
              value={`${PAYMENT_LABELS[tx.payment_type ?? ''] ?? tx.payment_type ?? '-'}${tx.payment_detail ? ` · ${tx.payment_detail}` : ''}`}
            />
            {!isDebt && <Row label="Dibayar" value={rupiah(tx.amount_paid)} />}
            {!isDebt && change > 0 && <Row label="Kembalian" value={rupiah(change)} />}
            {overpay > 0 && <Row label="Kelebihan (tidak dikembalikan)" value={rupiah(overpay)} tone="text-green-700" />}
            {isDebt && (
              <>
                <Row
                  label="Status Bon"
                  value={tx.debt_status === 'paid' ? 'Lunas' : 'Belum Lunas'}
                  tone={tx.debt_status === 'paid' ? 'text-green-700' : 'text-amber-700'}
                />
                {tx.debt_status === 'paid' && (
                  <Row
                    label="Dilunasi"
                    value={`${formatDateTime(tx.debt_paid_at)}${tx.debt_paid_method ? ` · ${tx.debt_paid_method === 'tunai' ? 'Tunai' : 'Non-tunai'}` : ''}`}
                  />
                )}
              </>
            )}
          </div>

          {tx.notes && (
            <div className="flex gap-2 text-sm bg-amber-50 text-amber-800 rounded-lg p-3">
              <StickyNote className="w-4 h-4 mt-0.5 shrink-0" />
              <p>{tx.notes}</p>
            </div>
          )}

          {edits.length > 0 && (
            <div>
              <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase text-gray-500 mb-2">
                <History className="w-3.5 h-3.5" /> Riwayat Koreksi
              </h3>
              <ol className="space-y-2">
                {edits.map((e, i) => (
                  <li key={i} className="text-sm border-l-2 border-blue-200 pl-3">
                    <p className="text-gray-900">{e.summary || '-'}</p>
                    {e.reason && <p className="text-xs text-gray-500">Alasan: {e.reason}</p>}
                    <p className="text-xs text-gray-400">
                      {formatDateTime(e.at)}
                      {e.by ? ` · ${e.by}` : ''}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
