import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { LayoutDashboard, Receipt, RefreshCw, LogOut, Store, Building2, Package } from 'lucide-react'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 hidden md:flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-gray-200">
          <Store className="w-6 h-6 text-blue-600 mr-2" />
          <span className="text-lg font-bold text-gray-900">KasirKu Admin</span>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <Link href="/dashboard" className="flex items-center px-4 py-3 text-gray-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">
            <LayoutDashboard className="w-5 h-5 mr-3 text-blue-600" />
            <span className="font-medium">Overview</span>
          </Link>
          <Link href="/dashboard/businesses" className="flex items-center px-4 py-3 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <Building2 className="w-5 h-5 mr-3" />
            <span className="font-medium">Cabang Usaha</span>
          </Link>
          <Link href="/dashboard/products" className="flex items-center px-4 py-3 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <Package className="w-5 h-5 mr-3" />
            <span className="font-medium">Produk & Menu</span>
          </Link>
          <Link href="/dashboard/transactions" className="flex items-center px-4 py-3 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <Receipt className="w-5 h-5 mr-3" />
            <span className="font-medium">Transaksi</span>
          </Link>
          <Link href="/dashboard/sync" className="flex items-center px-4 py-3 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <RefreshCw className="w-5 h-5 mr-3" />
            <span className="font-medium">Status Sinkronisasi</span>
          </Link>
        </nav>

        <div className="p-4 border-t border-gray-200">
          <div className="mb-4">
            <p className="text-sm font-medium text-gray-900 truncate">{user.email}</p>
            <p className="text-xs text-gray-500">Owner</p>
          </div>
          <form action="/auth/signout" method="post">
            <button className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors">
              <LogOut className="w-4 h-4 mr-2" />
              Keluar
            </button>
          </form>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile header could go here */}
        <div className="flex-1 overflow-auto p-8">
          {children}
        </div>
      </main>
    </div>
  )
}
