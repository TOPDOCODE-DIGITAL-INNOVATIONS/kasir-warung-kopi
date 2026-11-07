import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Menyegarkan sesi Supabase (cookie), melindungi /dashboard, dan mengarahkan /kasir -> /kasir/.
export async function proxy(request: NextRequest) {
  // Aplikasi kasir harus dibuka di /kasir/ (dengan garis miring) agar scope service worker cocok.
  if (request.nextUrl.pathname === '/kasir') {
    // URL biasa (bukan nextUrl.clone) karena nextUrl membuang garis miring di akhir.
    const url = new URL('/kasir/', request.url)
    url.search = request.nextUrl.search
    return NextResponse.redirect(url, 308)
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user && request.nextUrl.pathname.startsWith('/dashboard')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: ['/dashboard/:path*', '/login', '/kasir'],
}
