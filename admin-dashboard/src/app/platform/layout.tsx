import DashboardShell from '../dashboard/DashboardShell'
import { requireSuperAdmin } from '@/lib/platform-auth'
import { platformRoleLabel } from '@/lib/platform-account'
import { otherPlatformBillingDashboard, platformBillingEnvironment } from '@/lib/platform-billing/config'
import PlatformModeSelect from './PlatformModeSelect'

export const dynamic = 'force-dynamic'

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { user, account } = await requireSuperAdmin()
  const metadataName: unknown = user.user_metadata?.name ?? user.user_metadata?.full_name
  const name = typeof metadataName === 'string' && metadataName.trim()
    ? metadataName.trim() : user.email?.split('@')[0] || 'Super Admin'
  const mode = <PlatformModeSelect mode={platformBillingEnvironment()} otherDashboard={otherPlatformBillingDashboard()} />

  return (
    <DashboardShell platform platformMode={mode} name={name} email={user.email ?? ''} roleLabel={platformRoleLabel(account.role)}>
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-y-contain p-4 md:p-8">{children}</main>
    </DashboardShell>
  )
}
