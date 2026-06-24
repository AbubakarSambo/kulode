import { Link } from 'react-router-dom'
import { Lock, ArrowRight } from 'lucide-react'
import { useEffect } from 'react'
import { useSubscription } from '@/hooks/useSubscription'
import { posthog } from '@/lib/posthog'

export function SubscriptionExpiredBanner() {
  const { isExpired, subscription } = useSubscription()

  useEffect(() => {
    if (isExpired) {
      posthog.capture('subscription_expired_banner_shown', {
        plan: subscription?.planTier,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpired])

  if (!isExpired) return null

  return (
    <div className="bg-destructive/10 border-b border-destructive/20 text-destructive px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-4 z-50 animate-in fade-in slide-in-from-top duration-300">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive border border-destructive/20">
          <Lock className="h-4 w-4" />
        </div>
        <div>
          <p className="font-bold text-xs sm:text-sm tracking-tight">Subscription Expired</p>
          <p className="text-[11px] sm:text-xs opacity-90 font-medium">Your account is in read-only mode. You can view existing data but cannot create or edit records.</p>
        </div>
      </div>
      <Link
        to="/settings/billing"
        className="flex items-center gap-2 rounded-xl bg-destructive text-white px-4 py-2 text-xs font-semibold hover:bg-destructive/90 transition-colors shadow-sm cursor-pointer select-none min-h-[36px]"
      >
        Renew Subscription
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  )
}
