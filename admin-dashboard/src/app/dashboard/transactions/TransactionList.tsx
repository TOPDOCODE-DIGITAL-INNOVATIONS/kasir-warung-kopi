'use client'

import { useEffect, useState } from 'react'
import { X, ChevronRight, User, Store, Clock, ShoppingBag, StickyNote, History } from 'lucide-react'
import { formatDateTime, rupiah, PAYMENT_LABELS } from '@/lib/format'
import type { TxRow, TxItem } from './types'

const num = (v: number | string | null | undefined) => Number(v) || 0

function itemCount(tx: TxRow) {
  return (tx.items ?? []).reduce((s, i) => s + (i.quantity ?? 1), 0)
}

function itemSummary(tx: TxRow) {
  return (tx.items ?? []).map((i) => `${i.product?.name ?? '?'} x${i.quantity ?? 1}`).join(', ')
}

export function StatusBadge({ tx }: { tx: TxRow }) {
  if (tx.status === 'cancelled')
    return <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-semibold rounded-full">Batal</span>
  if (tx.payment_type === 'hutang')
    return (
      <span
        className={
          'px-2 py-0.5 text-xs font-semibold rounded-full ' +
          (tx.debt_status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700')
        }
      >
        Bon {tx.debt_status === 'paid' ? 'Lunas' : 'Belum Lunas'}
      </span>
    )
  return (
    <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs font-semibold rounded-full">
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
    return <p className="px-4 py-10 text-center text-sm text-gray-500">Belum ada transaksi.</p>
  }

  return (
    <>
      {/* Desktop: tabel */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left text-sm text-gray-600">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">Waktu</th>
              <th className="px-4 py-3 font-medium">No. Nota</th>
              {showBusiness && <th className="px-4 py-3 font-medium">Cabang</th>}
              <th className="px-4 py-3 font-medium">Pelanggan / Kasir</th>
              {!compact && <th className="px-4 py-3 font-medium">Pesanan</th>}
              <th className="px-4 py-3 font-medium">Bayar</th>
              <th className="px-4 py-3 font-medium text-right">Total</th>
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
                  className={'cursor-pointer ' + (cancelled ? 'bg-red-50/40 text-gray-400 hover:bg-red-50' : 'hover:bg-blue-50/40')}
                >
                  <td className="px-4 py-3 whitespace-nowrap text-gray-900">{formatDateTime(tx.created_at)}</td>
                  <td className="px-4 py-3 whitespace-nowrap font-mono text-xs">{tx.id}</td>
                  {showBusiness && <td className="px-4 py-3">{tx.businesses?.name ?? '-'}</td>}
                  <td className="px-4 py-3">
                    <p className="text-gray-900">{tx.customer_name || tx.order_type || '-'}</p>
                    <p className="text-xs text-gray-400">{tx.cashier_name ?? '-'}</p>
                  </td>
                  {!compact && (
                    <td className="px-4 py-3 text-xs max-w-xs">
                      <p className="truncate">{itemSummary(tx)}</p>
                      <p className="text-gray-400">{itemCount(tx)} item</p>
                    </td>
                  )}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <StatusBadge tx={tx} />
                  </td>
                  <td className={'px-4 py-3 text-right font-semibold whitespace-nowrap ' + (cancelled ? 'line-through' : 'text-gray-900')}>
                    {rupiah(tx.grand_total)}
                  </td>
                  <td className="pr-3 text-gray-300">
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
    </>
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
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md h-full bg-white shadow-xl flex flex-col">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
          <div className="min-w-0">
            <p className="text-xs text-gray-400">Detail Pesanan</p>
            <h2 className="font-mono text-sm font-semibold text-gray-900 break-all">{tx.id}</h2>
            <div className="mt-1.5">
              <StatusBadge tx={tx} />
            </div>
          </div>
          <button onClick={onClose} className="p-2 -mr-2 rounded-lg text-gray-500 hover:bg-gray-100" aria-label="Tutup">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
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

          <div className="grid grid-cols-2 gap-3">
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

          <div className="space-y-1.5 bg-gray-50 rounded-lg p-3">
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
