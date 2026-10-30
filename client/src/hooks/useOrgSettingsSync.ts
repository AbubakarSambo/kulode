import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { organizationsApi } from '@/api/organizations'
import { useAuthStore } from '@/stores/auth'

// The signed-in org's settings, shared from one cache entry by everything that needs a live copy
// (this sync, the takings strip). Saving org settings invalidates ['organization'], so a change
// shows up at once for the admin who made it and within staleTime for everyone else.
export function useCurrentOrgSettings() {
  const organizationId = useAuthStore((state) => state.user?.organizationId)
  return useQuery({
    queryKey: ['organization', 'settings-sync', organizationId],
    queryFn: () => organizationsApi.getCurrent(),
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  })
}

// The org's enabledModules/posMode are cached in the persisted session from login, and every
// module/posMode-gated nav item, route and role list reads that copy. Without this, a change made
// since (a platform admin switching an org to POS + Invoicing, a data migration) only showed up
// after the user logged out and back in — until then they saw the old roles and pages.
export function useOrgSettingsSync() {
  const user = useAuthStore((state) => state.user)
  const updateUser = useAuthStore((state) => state.updateUser)
  const { data: org } = useCurrentOrgSettings()

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
