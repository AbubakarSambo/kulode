import { useEffect } from 'react'
import { useAuthStore } from '@/stores/auth'
import { setAnalyticsContext } from '@/lib/posthog'
import { useCurrentOrgSettings } from '@/hooks/useOrgSettingsSync'

// Keeps PostHog's organization group, plan and role properties current for the signed-in session.
// Login sets a first version from the session alone; this adds what only the full organization
// record has (signup date, demo/test flags, went-live) and refreshes it whenever the plan or
// settings change (e.g. after an upgrade).
export function useAnalyticsContext() {
  const user = useAuthStore((state) => state.user)
  const { data: org } = useCurrentOrgSettings()

  useEffect(() => {
    if (!user) return
    setAnalyticsContext(user, org)
  }, [user, org])
}
