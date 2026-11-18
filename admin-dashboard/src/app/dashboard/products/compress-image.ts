import { productImageError, productImageSourceError } from './image'

export type ImageEncode = (width: number, height: number, quality: number) => Promise<Blob>

export function productPhotoDimensions(width: number, height: number, maxEdge = 1280) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || width * height > 64_000_000) throw new Error('Dimensi foto tidak valid atau terlalu besar. Gunakan foto maksimal 64 megapiksel.')
  const ratio = Math.min(1, maxEdge / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) }
}

/** Quality is reduced first; if necessary, retry at smaller dimensions. No silent oversized fallback. */
export async function encodeProductPhoto(width: number, height: number, encode: ImageEncode) {
  let size = productPhotoDimensions(width, height)
  for (let round = 0; round < 12; round++) {
    for (const quality of [0.82, 0.72, 0.62, 0.5]) {
      const blob = await encode(size.width, size.height, quality)
      if (blob.type !== 'image/webp') throw new Error('Browser ini belum mendukung kompresi WebP. Gunakan Chrome atau Edge versi terbaru.')
      if (!productImageError(blob.size, blob.type)) return blob
    }
    const next = { width: Math.max(1, Math.floor(size.width * 0.8)), height: Math.max(1, Math.floor(size.height * 0.8)) }
    if (next.width === size.width && next.height === size.height) break
    size = next
  }
  throw new Error('Foto belum dapat dikompres di bawah 200 KiB. Pilih gambar lain atau perkecil foto sumber.')
}

export async function compressProductImage(file: File): Promise<File> {
  const invalid = productImageSourceError(file.size, file.type)
  if (invalid) throw new Error(invalid)
  const url = URL.createObjectURL(file), image = new Image()
  const canvas = document.createElement('canvas')
  try {
    image.src = url
    try { await image.decode() } catch { throw new Error('Foto tidak dapat dibaca. Pilih gambar JPG, PNG, atau WebP yang valid.') }
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Browser tidak dapat memproses foto ini.')
    const blob = await encodeProductPhoto(image.naturalWidth, image.naturalHeight, (width, height, quality) => {
      canvas.width = width; canvas.height = height
      context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high'
      context.drawImage(image, 0, 0, width, height)
      return new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('Foto gagal diproses. Pilih gambar lain.')), 'image/webp', quality))
    })
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'produk'}.webp`, { type: 'image/webp', lastModified: file.lastModified })
  } finally {
    URL.revokeObjectURL(url)
    image.src = ''
    canvas.width = 0; canvas.height = 0
  }
}
