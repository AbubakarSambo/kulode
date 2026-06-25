import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useSubscription } from '@/hooks/useSubscription'
import { toast } from 'sonner'
import { useEffect } from 'react'
import { posthog } from '@/lib/posthog'

interface ReadOnlyGatedRouteProps {
  redirectTo: string
}

export function ReadOnlyGatedRoute({ redirectTo }: ReadOnlyGatedRouteProps) {
  const { isReadOnlyMode, isLoading } = useSubscription()
  const location = useLocation()

  useEffect(() => {
    if (isReadOnlyMode && !isLoading) {
      posthog.capture('read_only_action_blocked', {
        attempted_path: location.pathname,
        redirect_to: redirectTo,
      })
      toast.warning('Account is in read-only mode', {
        description: 'Your subscription has expired. This action is disabled.',
      })
    }
  }, [isReadOnlyMode, isLoading])

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (isReadOnlyMode) {
    return <Navigate to={redirectTo} replace />
  }

  return <Outlet />
}
