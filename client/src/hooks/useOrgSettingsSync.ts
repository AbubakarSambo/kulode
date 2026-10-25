import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { organizationsApi } from '@/api/organizations'
import { useAuthStore } from '@/stores/auth'

// The org's enabledModules/posMode are cached in the persisted session from login, and every
// module/posMode-gated nav item, route and role list reads that copy. Without this, a change made
// since (a platform admin switching an org to POS + Invoicing, a data migration) only showed up
// after the user logged out and back in — until then they saw the old roles and pages.
export function useOrgSettingsSync() {
  const user = useAuthStore((state) => state.user)
  const updateUser = useAuthStore((state) => state.updateUser)

  const { data: org } = useQuery({
    queryKey: ['organization', 'settings-sync', user?.organizationId],
    queryFn: () => organizationsApi.getCurrent(),
    enabled: !!user?.organizationId,
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    if (!org || !user?.organization) return
    const { enabledModules, posMode } = user.organization
    if (org.enabledModules === enabledModules && org.posMode === posMode) return
    updateUser({
      organization: {
        ...user.organization,
        ...(org.enabledModules && { enabledModules: org.enabledModules }),
        ...(org.posMode && { posMode: org.posMode }),
      },
    })
  }, [org, user?.organization, updateUser])
}
