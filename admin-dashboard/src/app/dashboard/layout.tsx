import { getBusinessContext } from '@/lib/business-context'
import { LogOut, Store } from 'lucide-react'
import Nav from './Nav'
import BusinessContextSelect from './BusinessContextSelect'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, businesses, businessId } = await getBusinessContext()

  const signOut = (
    <form action="/auth/signout" method="post">
      <button className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors">
        <LogOut className="w-4 h-4 mr-2" />
        Keluar
      </button>
    </form>
  )

  return (
    <div className="min-h-screen bg-gray-50 md:flex">
      <aside className="print:hidden w-64 bg-white border-r border-gray-200 hidden md:flex flex-col sticky top-0 h-screen">
        <div className="h-16 flex items-center px-6 border-b border-gray-200">
          <Store className="w-6 h-6 text-blue-600 mr-2" />
          <span className="text-lg font-bold text-gray-900">KasirKu Admin</span>
        </div>
        <Nav />
        <div className="p-4 border-t border-gray-200">
          <BusinessContextSelect businesses={businesses} businessId={businessId} />
          <div className="mb-3 px-4">
            <p className="text-sm font-medium text-gray-900 truncate">{user.email}</p>
            <p className="text-xs text-gray-500">Owner</p>
          </div>
          {signOut}
        </div>
      </aside>

      <header className="print:hidden md:hidden bg-white border-b border-gray-200">
        <div className="h-14 flex items-center justify-between px-4">
          <span className="flex items-center font-bold">
            <Store className="w-5 h-5 text-blue-600 mr-2" /> KasirKu Admin
          </span>
          <div className="w-28">{signOut}</div>
        </div>
        <Nav mobile />
        <div className="px-4"><BusinessContextSelect businesses={businesses} businessId={businessId} /></div>
      </header>

      <main key={businessId ?? 'no-business'} className="flex-1 min-w-0 p-4 md:p-8">{children}</main>
    </div>
  )
}
