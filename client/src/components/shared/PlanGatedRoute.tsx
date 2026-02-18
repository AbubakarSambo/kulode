import { Outlet, Link } from 'react-router-dom'
import { Crown } from 'lucide-react'
import { useSubscription } from '@/hooks/useSubscription'
import type { PlanTier } from '@/types'

interface PlanGatedRouteProps {
  requiredPlan: PlanTier
}

export function PlanGatedRoute({ requiredPlan }: PlanGatedRouteProps) {
  const { hasRequiredPlan, isLoading } = useSubscription()

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!hasRequiredPlan(requiredPlan)) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="mx-auto max-w-md text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Crown className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-xl font-semibold">Upgrade to {requiredPlan}</h2>
          <p className="mt-2 text-muted-foreground">
            This feature requires a {requiredPlan} plan or higher. Upgrade your plan to unlock access.
          </p>
          <Link
            to="/settings/billing"
            className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            View Plans & Upgrade
          </Link>
        </div>
      </div>
    )
  }

  return <Outlet />
}
