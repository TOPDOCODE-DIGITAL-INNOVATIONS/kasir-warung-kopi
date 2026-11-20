import DashboardShell from '../dashboard/DashboardShell'
import { requireSuperAdmin } from '@/lib/platform-auth'
import { platformRoleLabel } from '@/lib/platform-account'
import { ChevronDown } from 'lucide-react'
import { otherPlatformBillingDashboard, platformBillingEnvironment } from '@/lib/platform-billing/config'

export const dynamic = 'force-dynamic'

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { user, account } = await requireSuperAdmin()
  const metadataName: unknown = user.user_metadata?.name ?? user.user_metadata?.full_name
  const name = typeof metadataName === 'string' && metadataName.trim()
    ? metadataName.trim() : user.email?.split('@')[0] || 'Super Admin'
  const live = platformBillingEnvironment() === 'live'
  const otherDashboard = otherPlatformBillingDashboard()
  const modeClass = `inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium ${live
    ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`
  const modeLabel = live ? 'Live' : 'Test'
  const alternateLabel = live ? 'Test' : 'Live'
  const mode = otherDashboard ? (
    <details className="relative shrink-0">
      <summary aria-label={`Lingkungan platform ${modeLabel}`} className={`${modeClass} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
        {modeLabel} <ChevronDown aria-hidden="true" className="h-4 w-4" />
      </summary>
      <a href={otherDashboard} className="absolute right-0 z-10 mt-2 block whitespace-nowrap rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 shadow-md hover:bg-gray-50">
        Buka dashboard {alternateLabel}
      </a>
    </details>
  ) : <span aria-label={`Lingkungan platform ${modeLabel}`} className={modeClass}>{modeLabel}</span>

  return (
    <DashboardShell platform platformMode={mode} name={name} email={user.email ?? ''} roleLabel={platformRoleLabel(account.role)}>
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-y-contain p-4 md:p-8">{children}</main>
    </DashboardShell>
  )
}
