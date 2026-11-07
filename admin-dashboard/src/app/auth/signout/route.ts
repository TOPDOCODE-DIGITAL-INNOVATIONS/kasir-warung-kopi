import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

// Sama dengan region database Supabase (Sydney); lihat src/app/layout.tsx.
export const preferredRegion = 'syd1'

export async function POST(request: Request) {
  const supabase = await createClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/login', request.url), { status: 303 })
}
