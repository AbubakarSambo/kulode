import { Link } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { useSubscription } from '@/hooks/useSubscription'

export function TrialBanner() {
  const { subscription, isTrial, isExpired, isActive, isGrandfathered, trialDaysRemaining, isLoading } = useSubscription()

  if (isLoading || isGrandfathered || isActive) return null

  const activeUsers = subscription?.usage.activeUsers ?? 0
  const maxUsers = subscription?.limits.maxUsers ?? Infinity
  const isOverUserLimit = activeUsers > maxUsers

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
      <div className="flex flex-col items-center gap-1 bg-destructive/10 border-b border-destructive/20 px-4 py-2 text-sm text-destructive sm:flex-row sm:justify-center sm:gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            Your Pro trial has ended.{' '}
            <Link to="/settings/billing" className="font-semibold underline hover:no-underline">
              Upgrade to continue
            </Link>
          </span>
        </div>
        {isOverUserLimit && (
          <span className="pl-6 sm:pl-0 sm:border-l sm:border-destructive/30 sm:ml-2 sm:pl-2">
            You have {activeUsers} active users but your Free plan allows {maxUsers}.{' '}
            <Link to="/settings/users" className="font-semibold underline hover:no-underline">
              Remove users
            </Link>
            {' '}or{' '}
            <Link to="/settings/billing" className="font-semibold underline hover:no-underline">
              upgrade
            </Link>
            .
          </span>
        )}
      </div>
    )
  }

  return null
}
