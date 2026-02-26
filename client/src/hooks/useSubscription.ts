import { useQuery } from '@tanstack/react-query'
import { subscriptionApi } from '@/api/subscription'
import { useAuthStore } from '@/stores/auth'
import type { PlanTier } from '@/types'

const PLAN_HIERARCHY: Record<string, number> = { FREE: 0, PRO: 1, BUSINESS: 2 }

export function useSubscription() {
  const user = useAuthStore((state) => state.user)

  const { data: subscription, isLoading } = useQuery({
    queryKey: ['subscription', 'current'],
    queryFn: subscriptionApi.getCurrent,
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled: !!user,
  })

  const effectivePlan: PlanTier = subscription?.effectivePlan ?? user?.plan?.planTier ?? 'FREE'
  const isGrandfathered = subscription?.isGrandfathered ?? user?.plan?.isGrandfathered ?? false

  const canAccessPage = (pageName: string): boolean => {
    if (isGrandfathered) return true
    if (user?.isPlatformAdmin) return true
    if (!subscription) {
      // Fallback to user plan info
      return effectivePlan !== 'FREE'
    }
    return !subscription.limits.restrictedPages.includes(pageName)
  }

  const hasRequiredPlan = (requiredPlan: PlanTier): boolean => {
    if (isGrandfathered) return true
    if (user?.isPlatformAdmin) return true
    return (PLAN_HIERARCHY[effectivePlan] ?? 0) >= (PLAN_HIERARCHY[requiredPlan] ?? 0)
  }

  return {
    subscription,
    isLoading,
    effectivePlan,
    isGrandfathered,
    isTrial: subscription?.subscriptionStatus === 'TRIALING',
    isActive: subscription?.subscriptionStatus === 'ACTIVE',
    isExpired: subscription?.subscriptionStatus === 'EXPIRED' ||
      (subscription?.subscriptionStatus === 'TRIALING' && subscription?.trialDaysRemaining === 0),
    trialDaysRemaining: subscription?.trialDaysRemaining ?? null,
    canAccessPage,
    hasRequiredPlan,
  }
}
