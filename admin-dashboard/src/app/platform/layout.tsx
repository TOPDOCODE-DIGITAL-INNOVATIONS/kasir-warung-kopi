import { cookies } from 'next/headers'
import DashboardShell from '../dashboard/DashboardShell'
import { requireSuperAdmin } from '@/lib/platform-auth'
import { platformRoleLabel } from '@/lib/platform-account'
import { SIDEBAR_COOKIE } from '../dashboard/nav-config'

export const dynamic = 'force-dynamic'

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { user, account } = await requireSuperAdmin()
  const metadataName: unknown = user.user_metadata?.name ?? user.user_metadata?.full_name
  const name = typeof metadataName === 'string' && metadataName.trim()
    ? metadataName.trim() : user.email?.split('@')[0] || 'Super Admin'

  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === 'collapsed'

  return (
    <DashboardShell platform name={name} email={user.email ?? ''} roleLabel={platformRoleLabel(account.role)} initialCollapsed={collapsed}>
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-y-contain p-4 md:px-10 md:py-8">
        <div className="mx-auto w-full max-w-[1440px]">{children}</div>
      </main>
    </DashboardShell>
  )
}
