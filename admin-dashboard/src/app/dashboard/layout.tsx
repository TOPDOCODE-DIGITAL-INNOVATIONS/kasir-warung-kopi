import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getBusinessContext } from '@/lib/business-context'
import DashboardShell from './DashboardShell'
import { platformLandingPath, platformRoleLabel } from '@/lib/platform-account'
import { getCurrentOwnerAccess } from '@/lib/billing/owner-billing'
import SubscriptionBanner from './SubscriptionBanner'
import { SIDEBAR_COOKIE } from './nav-config'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, account, businesses, businessId } = await getBusinessContext()
  if (account.role === 'super_admin') redirect(platformLandingPath(user))
  const { access } = await getCurrentOwnerAccess()
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === 'collapsed'
  const metadataName = user.user_metadata?.name ?? user.user_metadata?.full_name
  const name = typeof metadataName === 'string' && metadataName.trim()
    ? metadataName.trim() : user.email?.split('@')[0] || 'Owner'

  return (
    <DashboardShell businesses={businesses} businessId={businessId} name={name} email={user.email ?? ''} roleLabel={platformRoleLabel(account.role)} access={access} initialCollapsed={collapsed}>
      <main key={businessId ?? 'no-business'} className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-y-contain p-4 md:px-10 md:py-8 print:overflow-visible print:p-0">
        <div className="mx-auto w-full max-w-[1440px]">
          <SubscriptionBanner access={access} />
          {children}
        </div>
      </main>
    </DashboardShell>
  )
}
