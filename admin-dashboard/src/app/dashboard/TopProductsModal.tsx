'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { formatRange } from '@/lib/book-period'
import type { OverviewRange, RankedProduct } from './overview-domain'

export default function TopProductsModal({ products, range, onClose }: {
  products: RankedProduct[]; range: OverviewRange; onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  return (
    <dialog ref={dialogRef} aria-labelledby="top-products-title" aria-describedby="top-products-description"
      onCancel={event => { event.preventDefault(); onClose() }}
      onClick={event => { if (event.target === event.currentTarget) onClose() }}
      className="m-auto w-[calc(100%_-_2rem)] max-w-2xl max-h-[85dvh] overflow-hidden rounded-xl border border-gray-100 bg-white p-0 text-gray-900 shadow-xl backdrop:bg-black/40">
      <div className="flex max-h-[85dvh] flex-col">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-100 p-5">
          <div>
            <h2 id="top-products-title" className="text-lg font-semibold">Seluruh Produk Terlaris</h2>
            <p id="top-products-description" className="mt-1 text-sm text-gray-500">{formatRange(range.start, range.end)} · {products.length} produk, diurutkan dari jumlah terjual terbanyak.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup produk terlaris" className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X className="h-5 w-5" /></button>
        </div>
        <div tabIndex={0} aria-label="Daftar peringkat produk" className="min-h-0 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-gray-50 text-xs uppercase text-gray-500">
              <tr><th scope="col" className="px-5 py-3 w-16">No.</th><th scope="col" className="px-5 py-3">Produk</th><th scope="col" className="px-5 py-3 text-right">Jumlah terjual</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {products.map((product, index) => <tr key={product.key} className="hover:bg-gray-50"><td className="px-5 py-3 text-gray-400">{index + 1}</td><td className="px-5 py-3 break-words">{product.name}</td><td className="px-5 py-3 text-right font-semibold tabular-nums">{product.qty.toLocaleString('id-ID')}</td></tr>)}
              {!products.length && <tr><td colSpan={3} className="px-5 py-8 text-center text-gray-500">Belum ada produk terjual pada rentang ini.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="shrink-0 border-t border-gray-100 p-4 text-xs text-gray-500">Mengikuti filter cabang dan tanggal di Overview. Transaksi batal tidak dihitung.</div>
      </div>
    </dialog>
  )
}
