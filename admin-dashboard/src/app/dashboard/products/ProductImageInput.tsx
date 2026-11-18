'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { ImagePlus, ImageOff } from 'lucide-react'
import { productImageSourceError } from './image'
import { compressProductImage } from './compress-image'

export default function ProductImageInput({ initialUrl, file, removed, onChange, onProcessingChange }: {
  initialUrl: string | null; file: File | null; removed: boolean; onChange: (file: File | null, removed: boolean) => void; onProcessingChange: (processing: boolean) => void
}) {
  const id = useId(), ref = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null), [error, setError] = useState(''), [failed, setFailed] = useState(false)
  const [processing, setProcessing] = useState(false)
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  const source = file ? preview : removed ? null : initialUrl
  return <section className="rounded-lg border border-gray-200 p-4" aria-labelledby={`${id}-title`}>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50 text-gray-400">
        {/* eslint-disable-next-line @next/next/no-img-element -- Blob and public Storage previews. */}
        {source && !failed ? <img src={source} alt="Pratinjau foto produk" className="h-full w-full object-cover" onError={() => { setFailed(true); if (file) ref.current?.setCustomValidity('Foto tidak dapat dibaca. Pilih gambar lain atau hapus foto.') }} /> : <ImageOff className="h-8 w-8" aria-hidden="true" />}
      </div>
      <div className="min-w-0 space-y-2">
        <h3 id={`${id}-title`} className="text-sm font-medium text-gray-700">Foto produk (opsional)</h3>
        <p className="text-xs text-gray-500">Pilih JPG, PNG, atau WebP maksimal 10 MiB. Foto otomatis dikompres menjadi WebP di bawah 200 KiB. Tanpa foto, kasir memakai ikon kategori.</p>
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor={id} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"><ImagePlus className="h-4 w-4" />{source ? 'Ganti foto' : 'Pilih foto'}</label>
          <input ref={ref} id={id} type="file" accept="image/jpeg,image/png,image/webp" disabled={processing} className="sr-only" onChange={async event => {
            const node = event.currentTarget, selected = node.files?.[0]
            if (!selected) return
            const invalid = productImageSourceError(selected.size, selected.type)
            if (invalid) { setError(invalid); node.value = ''; return }
            setProcessing(true); onProcessingChange(true); setError('')
            try {
              const compressed = await compressProductImage(selected)
              node.setCustomValidity(''); setPreview(URL.createObjectURL(compressed)); setFailed(false); onChange(compressed, false)
            } catch (cause) { setError(cause instanceof Error ? cause.message : 'Foto gagal diproses.'); node.value = '' }
            finally { setProcessing(false); onProcessingChange(false) }
          }} />
          {source && <button type="button" disabled={processing} onClick={() => { onChange(null, true); setPreview(null); setFailed(false); setError(''); if (ref.current) { ref.current.value = ''; ref.current.setCustomValidity('') } }} className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50">Hapus foto</button>}
        </div>
        {processing && <p role="status" className="text-xs text-blue-600">Memproses foto...</p>}
        {file && <p className="truncate text-xs text-gray-500" title={file.name}>{file.name} · {(file.size / 1024).toLocaleString('id-ID', { maximumFractionDigits: 1 })} KiB</p>}
        {failed && <p className="text-xs text-amber-700">Foto tidak dapat ditampilkan. Pilih foto lain atau hapus foto.</p>}
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      </div>
    </div>
  </section>
}
