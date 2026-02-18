import { Link } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { useSubscription } from '@/hooks/useSubscription'

export function TrialBanner() {
  const { isTrial, isExpired, isActive, isGrandfathered, trialDaysRemaining, isLoading } = useSubscription()

  if (isLoading || isGrandfathered || isActive) return null

  if (isTrial && trialDaysRemaining !== null && trialDaysRemaining > 0) {
    return (
      <div className="flex items-center justify-center gap-2 bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-sm text-amber-700 dark:text-amber-400">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>
          {trialDaysRemaining} day{trialDaysRemaining !== 1 ? 's' : ''} left in your Pro trial.{' '}
          <Link to="/settings/billing" className="font-semibold underline hover:no-underline">
            Upgrade now
          </Link>
        </span>
      </div>
    )
  }

  if (isExpired || (isTrial && trialDaysRemaining === 0)) {
    return (
      <div className="flex items-center justify-center gap-2 bg-destructive/10 border-b border-destructive/20 px-4 py-2 text-sm text-destructive">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>
          Your Pro trial has ended.{' '}
          <Link to="/settings/billing" className="font-semibold underline hover:no-underline">
            Upgrade to continue
          </Link>
        </span>
      </div>
    )
  }

  return null
}
