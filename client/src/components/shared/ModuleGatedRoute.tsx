import { Navigate, Outlet } from 'react-router-dom'
import { useOrgModules } from '@/hooks/useOrgModules'

interface ModuleGatedRouteProps {
  requiredModule: 'POS' | 'INVOICING'
  redirectTo: string
}

export function ModuleGatedRoute({ requiredModule, redirectTo }: ModuleGatedRouteProps) {
  const { hasPos, hasInvoicing } = useOrgModules()
  const hasAccess = requiredModule === 'POS' ? hasPos : hasInvoicing

  if (!hasAccess) {
    return <Navigate to={redirectTo} replace />
  }

  return <Outlet />
}
