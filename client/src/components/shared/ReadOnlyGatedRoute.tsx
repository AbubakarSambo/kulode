import { Navigate, Outlet } from 'react-router-dom'
import { useSubscription } from '@/hooks/useSubscription'
import { toast } from 'sonner'
import { useEffect } from 'react'

interface ReadOnlyGatedRouteProps {
  redirectTo: string
}

export function ReadOnlyGatedRoute({ redirectTo }: ReadOnlyGatedRouteProps) {
  const { isReadOnlyMode, isLoading } = useSubscription()

  useEffect(() => {
    if (isReadOnlyMode && !isLoading) {
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
