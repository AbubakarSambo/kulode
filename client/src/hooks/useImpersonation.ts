import { useMutation } from '@tanstack/react-query'
import type { AxiosError } from 'axios'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { platformApi } from '@/api/platform'
import { useAuthStore } from '@/stores/auth'
import { posthog } from '@/lib/posthog'
import { getPostAuthRoute as postAuthRoute } from '@/lib/authRouting'

// Platform admin → read-only "View as Super Admin" session for one org. The store parks the
// admin's own session (see impersonationOrigin) and clears the query cache on the way in and out,
// for the same reason useSwitchOrganization does: no cache key is org-namespaced.
export function useStartImpersonation() {
  const navigate = useNavigate()
  const startImpersonation = useAuthStore((state) => state.startImpersonation)

  return useMutation({
    mutationFn: ({ organizationId, reason }: { organizationId: string; reason?: string }) =>
      platformApi.startImpersonation(organizationId, reason),
    onSuccess: (data) => {
      startImpersonation(data.user, data.accessToken)
      posthog.capture('impersonation_started', { organizationId: data.user.organizationId })
      toast.success(`Viewing ${data.user.organizationName}`, { description: 'Read-only — changes are blocked' })
      navigate(postAuthRoute(data.user))
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      const message = error.response?.data?.message || 'Could not start the session'
      toast.error('View as failed', { description: message })
    },
  })
}

export function useExitImpersonation() {
  const navigate = useNavigate()
  const endImpersonation = useAuthStore((state) => state.endImpersonation)

  return useMutation({
    // Best-effort: ending the server-side session is the audit record, but the admin must get
    // their own session back even if this call fails (network blip, token already expired).
    mutationFn: () => platformApi.exitImpersonation().catch(() => undefined),
    onSettled: () => {
      const restored = endImpersonation()
      posthog.capture('impersonation_ended')
      navigate(restored ? '/admin' : '/login', { replace: true })
    },
  })
}
