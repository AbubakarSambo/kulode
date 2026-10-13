import { Navigate, Outlet } from 'react-router-dom'
import { usePosMode } from '@/hooks/useOrgModules'

interface PosModeGatedRouteProps {
  requiredPosMode: 'RESTAURANT' | 'RETAIL'
  redirectTo: string
}

export function PosModeGatedRoute({ requiredPosMode, redirectTo }: PosModeGatedRouteProps) {
  const { isRestaurant } = usePosMode()
  const hasAccess = requiredPosMode === 'RESTAURANT' ? isRestaurant : !isRestaurant

  if (!hasAccess) {
    return <Navigate to={redirectTo} replace />
  }

  return <Outlet />
}
