import { getBusinessContext } from '@/lib/business-context'
import DashboardShell from './DashboardShell'
import { platformRoleLabel } from '@/lib/platform-account'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, account, businesses, businessId } = await getBusinessContext()
  const metadataName = user.user_metadata?.name ?? user.user_metadata?.full_name
  const name = typeof metadataName === 'string' && metadataName.trim()
    ? metadataName.trim() : user.email?.split('@')[0] || 'Owner'

  return (
    <DashboardShell businesses={businesses} businessId={businessId} name={name} email={user.email ?? ''} roleLabel={platformRoleLabel(account.role)}>
      <main key={businessId ?? 'no-business'} className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-y-contain p-4 md:p-8 print:overflow-visible print:p-0">{children}</main>
    </DashboardShell>
  )
}
