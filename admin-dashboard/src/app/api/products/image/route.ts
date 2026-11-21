import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { requireBusinessContext } from '@/lib/business-context'
import { getCurrentOwnerAccess, READ_ONLY_MESSAGE } from '@/lib/billing/owner-billing'
import { uuid } from '@/app/dashboard/products/domain'
import { imageMatchesType, productImageError, PRODUCT_IMAGE_BUCKET, MAX_PRODUCT_IMAGE_BYTES } from '@/app/dashboard/products/image'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Silakan masuk kembali untuk mengunggah foto.' }, { status: 401 })
  if (Number(request.headers.get('content-length')) > MAX_PRODUCT_IMAGE_BYTES + 65536) return NextResponse.json({ error: 'Foto hasil kompresi harus di bawah 200 KiB.' }, { status: 413 })
  try {
    const form = await request.formData(), file = form.get('file')
    const businessId = String(form.get('business_id') ?? ''), productId = String(form.get('product_id') ?? '')
    if (!uuid(businessId) || !uuid(productId) || !(file instanceof File)) return NextResponse.json({ error: 'Data foto tidak valid.' }, { status: 400 })
    await requireBusinessContext(businessId)
    if ((await getCurrentOwnerAccess()).access.readOnly) return NextResponse.json({ error: READ_ONLY_MESSAGE }, { status: 403 })
    const invalid = productImageError(file.size, file.type)
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (!imageMatchesType(bytes, file.type)) return NextResponse.json({ error: 'Isi file tidak sesuai format gambar.' }, { status: 400 })
    const path = `${user.id}/${businessId}/${productId}/${crypto.randomUUID()}.webp`
    const { error } = await db.storage.from(PRODUCT_IMAGE_BUCKET).upload(path, bytes, { contentType: file.type, cacheControl: '31536000', upsert: false })
    if (error) return NextResponse.json({ error: 'Foto belum berhasil diunggah. Pastikan bucket foto produk sudah disiapkan.' }, { status: 500 })
    const { data } = db.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path)
    return NextResponse.json({ url: data.publicUrl })
  } catch {
    return NextResponse.json({ error: 'Foto belum berhasil diunggah. Periksa cabang aktif dan coba lagi.' }, { status: 400 })
  }
}
