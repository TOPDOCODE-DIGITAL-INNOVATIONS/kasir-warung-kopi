export const PRODUCT_IMAGE_BUCKET = 'product-images'
// Stored images must be strictly smaller than 200 KiB.
export const MAX_PRODUCT_IMAGE_BYTES = 200 * 1024
export const MAX_PRODUCT_IMAGE_SOURCE_BYTES = 10 * 1024 * 1024
export const PRODUCT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export function productImageError(size: number, type: string): string | null {
  if (type !== 'image/webp') return 'Foto hasil kompresi harus berformat WebP.'
  if (!size || size >= MAX_PRODUCT_IMAGE_BYTES) return 'Ukuran foto hasil kompresi harus di bawah 200 KiB.'
  return null
}

export function productImageSourceError(size: number, type: string): string | null {
  if (!PRODUCT_IMAGE_TYPES.includes(type as typeof PRODUCT_IMAGE_TYPES[number])) return 'Gunakan gambar JPG, PNG, atau WebP.'
  if (!size || size > MAX_PRODUCT_IMAGE_SOURCE_BYTES) return 'Ukuran foto sumber harus lebih dari 0 dan maksimal 10 MiB.'
  return null
}

export function imageMatchesType(bytes: Uint8Array, type: string): boolean {
  if (type === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  if (type === 'image/png') return [137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value)
  if (type === 'image/webp') return bytes.length >= 12 && [82,73,70,70].every((value, index) => bytes[index] === value) && [87,69,66,80].every((value, index) => bytes[index + 8] === value)
  return false
}

/** Only a photo uploaded under this owner/branch/product may be assigned to a product. */
export function productImagePath(url: string, supabaseUrl: string, owner: string, business: string, product: string): string | null {
  try {
    const parsed = new URL(url), base = new URL(supabaseUrl)
    const prefix = `${base.pathname.replace(/\/$/, '')}/storage/v1/object/public/${PRODUCT_IMAGE_BUCKET}/`
    if (parsed.origin !== base.origin || parsed.search || parsed.hash || !parsed.pathname.startsWith(prefix)) return null
    const path = parsed.pathname.slice(prefix.length)
    const expected = `${owner}/${business}/${product}/`
    if (!path.startsWith(expected) || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\.(jpg|png|webp)$/i.test(path.slice(expected.length))) return null
    return path
  } catch { return null }
}
