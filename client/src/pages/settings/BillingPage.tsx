import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check, Crown, Loader2, ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Header } from '@/components/layout'
import { Card, CardContent, Badge } from '@/components/ui'
import { subscriptionApi } from '@/api/subscription'
import { useSubscription } from '@/hooks/useSubscription'
import { Modal } from '@/components/shared'
import type { PlanTier, BillingPeriod } from '@/types'

const PLAN_FEATURES: Record<string, { name: string; price: { monthly: number; annual: number }; features: string[] }> = {
  FREE: {
    name: 'Free',
    price: { monthly: 0, annual: 0 },
    features: [
      'Up to 50 invoices/month',
      '1 user',
      'Clients & Invoices',
      'Payments',
      'Basic settings',
    ],
  },
  PRO: {
    name: 'Pro',
    price: { monthly: 9900, annual: 99000 },
    features: [
      'Up to 100 invoices/month',
      'Up to 3 users',
      'Everything in Free',
      'Dashboard & Reports',
      'Vendors & Expenses',
      'Inventory',
      'Expense Categories',
    ],
  },
  BUSINESS: {
    name: 'Business',
    price: { monthly: 24999, annual: 249990 },
    features: [
      'Unlimited invoices',
      'Unlimited users',
      'Everything in Pro',
      'Priority support',
      'Future analytics',
    ],
  },
}

function formatAmount(kobo: number) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(kobo)
}

export function BillingPage() {
  const queryClient = useQueryClient()
  const { subscription, effectivePlan, isGrandfathered } = useSubscription()
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('MONTHLY')
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [subscribingPlan, setSubscribingPlan] = useState<PlanTier | null>(null)

  const { data: paymentHistory } = useQuery({
    queryKey: ['subscription', 'payment-history'],
    queryFn: subscriptionApi.getPaymentHistory,
  })

  const subscribeMutation = useMutation({
    mutationFn: ({ planTier, period }: { planTier: PlanTier; period: BillingPeriod }) =>
      subscriptionApi.subscribe(planTier, period),
    onSuccess: (data) => {
      window.location.href = data.paymentUrl
    },
    onError: () => {
      toast.error('Failed to initialize payment. Please try again.')
    },
  })

  const cancelMutation = useMutation({
    mutationFn: subscriptionApi.cancel,
    onSuccess: (data) => {
      toast.success(data.message)
      setShowCancelModal(false)
      queryClient.invalidateQueries({ queryKey: ['subscription'] })
    },
    onError: () => {
      toast.error('Failed to cancel subscription.')
    },
  })

  const handleSubscribe = (planTier: PlanTier) => {
    setSubscribingPlan(planTier)
    subscribeMutation.mutate({ planTier, period: billingPeriod })
  }

  const statusLabel = () => {
    if (isGrandfathered) return <Badge variant="success">Grandfathered</Badge>
    if (!subscription) return null
    switch (subscription.subscriptionStatus) {
      case 'TRIALING':
        return <Badge variant="warning">Trial - {subscription.trialDaysRemaining} days left</Badge>
      case 'ACTIVE':
        return <Badge variant="success">Active</Badge>
      case 'CANCELLED':
        return <Badge variant="secondary">Cancelled</Badge>
      case 'EXPIRED':
        return <Badge variant="destructive">Expired</Badge>
      default:
        return <Badge variant="outline">{subscription.subscriptionStatus}</Badge>
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="Billing & Plans"
        description="Manage your subscription and billing"
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-6">
        {/* Back link */}
        <Link to="/settings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to Settings
        </Link>

        {/* Current plan */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold">Current Plan</h3>
                <p className="text-2xl font-bold text-primary">
                  {PLAN_FEATURES[effectivePlan]?.name ?? effectivePlan}
                </p>
                {subscription?.billingPeriod && (
                  <p className="text-sm text-muted-foreground">
                    {subscription.billingPeriod === 'MONTHLY' ? 'Monthly' : 'Annual'} billing
                    {subscription.subscriptionEndDate && (
                      <>
                        {' '}&middot;{' '}
                        {subscription.subscriptionStatus === 'CANCELLED'
                          ? `Access until ${new Date(subscription.subscriptionEndDate).toLocaleDateString()}`
                          : `Renews ${new Date(subscription.subscriptionEndDate).toLocaleDateString()}`}
                      </>
                    )}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {statusLabel()}
                {subscription?.subscriptionStatus === 'ACTIVE' && !isGrandfathered && (
                  <button
                    onClick={() => setShowCancelModal(true)}
                    className="text-sm text-muted-foreground hover:text-destructive transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>

            {/* Usage */}
            {subscription && !isGrandfathered && (
              <div className="mt-4 grid grid-cols-2 gap-4 border-t pt-4">
                <div>
                  <p className="text-sm text-muted-foreground">Invoices this month</p>
                  <p className="text-lg font-semibold">
                    {subscription.usage.invoicesThisMonth}
                    <span className="text-sm font-normal text-muted-foreground">
                      {' '}/ {subscription.limits.maxInvoicesPerMonth === Infinity ? '∞' : subscription.limits.maxInvoicesPerMonth}
                    </span>
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Active users</p>
                  <p className="text-lg font-semibold">
                    {subscription.usage.activeUsers}
                    <span className="text-sm font-normal text-muted-foreground">
                      {' '}/ {subscription.limits.maxUsers === Infinity ? '∞' : subscription.limits.maxUsers}
                    </span>
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Billing period toggle */}
        {!isGrandfathered && (
          <>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setBillingPeriod('MONTHLY')}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  billingPeriod === 'MONTHLY'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingPeriod('ANNUAL')}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  billingPeriod === 'ANNUAL'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                Annual
                <span className="ml-1 text-xs opacity-75">(Save ~17%)</span>
              </button>
            </div>

            {/* Pricing cards */}
            <div className="grid gap-4 sm:grid-cols-3">
              {(Object.entries(PLAN_FEATURES) as [PlanTier, typeof PLAN_FEATURES[string]][]).map(
                ([tier, plan]) => {
                  const isTrialing = subscription?.subscriptionStatus === 'TRIALING'
                  const isCurrent = !isTrialing && effectivePlan === tier
                  const price = billingPeriod === 'MONTHLY' ? plan.price.monthly : plan.price.annual
                  const isUpgrade = !isCurrent && tier !== 'FREE'

                  return (
                    <Card
                      key={tier}
                      className={`relative ${tier === 'PRO' ? 'border-primary shadow-md' : ''}`}
                    >
                      {tier === 'PRO' && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                          <Badge>Most Popular</Badge>
                        </div>
                      )}
                      <CardContent className="pt-6">
                        <div className="mb-4">
                          <h3 className="text-lg font-semibold">{plan.name}</h3>
                          <div className="mt-2">
                            <span className="text-3xl font-bold">
                              {price === 0 ? 'Free' : formatAmount(price)}
                            </span>
                            {price > 0 && (
                              <span className="text-sm text-muted-foreground">
                                /{billingPeriod === 'MONTHLY' ? 'month' : 'year'}
                              </span>
                            )}
                          </div>
                        </div>

                        <ul className="mb-6 space-y-2">
                          {plan.features.map((feature) => (
                            <li key={feature} className="flex items-start gap-2 text-sm">
                              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                              {feature}
                            </li>
                          ))}
                        </ul>

                        {isCurrent ? (
                          <button
                            disabled
                            className="w-full rounded-md border border-primary bg-primary/5 px-4 py-2 text-sm font-medium text-primary"
                          >
                            Current Plan
                          </button>
                        ) : isUpgrade ? (
                          <button
                            onClick={() => handleSubscribe(tier)}
                            disabled={subscribeMutation.isPending && subscribingPlan === tier}
                            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                          >
                            {subscribeMutation.isPending && subscribingPlan === tier ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Crown className="h-4 w-4" />
                            )}
                            Upgrade to {plan.name}
                          </button>
                        ) : null}
                      </CardContent>
                    </Card>
                  )
                }
              )}
            </div>
          </>
        )}

        {/* Payment history */}
        {paymentHistory && paymentHistory.length > 0 && (
          <Card>
            <CardContent className="pt-6">
              <h3 className="mb-4 text-lg font-semibold">Payment History</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 font-medium">Date</th>
                      <th className="pb-2 font-medium">Plan</th>
                      <th className="pb-2 font-medium">Period</th>
                      <th className="pb-2 font-medium text-right">Amount</th>
                      <th className="pb-2 font-medium">Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentHistory.map((payment) => (
                      <tr key={payment.id} className="border-b last:border-0">
                        <td className="py-2">{new Date(payment.paidAt).toLocaleDateString()}</td>
                        <td className="py-2">{payment.planTier}</td>
                        <td className="py-2">{payment.billingPeriod}</td>
                        <td className="py-2 text-right">{formatAmount(Number(payment.amount))}</td>
                        <td className="py-2 font-mono text-xs">{payment.paystackReference}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Cancel modal */}
        <Modal
          isOpen={showCancelModal}
          onClose={() => setShowCancelModal(false)}
          title="Cancel Subscription"
        >
          <div className="space-y-4">
            <p className="text-muted-foreground">
              Are you sure you want to cancel your subscription? You'll keep access until the end of
              your current billing period, then your account will be downgraded to the Free plan.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowCancelModal(false)}
                className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
              >
                Keep Subscription
              </button>
              <button
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
                className="flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
              >
                {cancelMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Cancel Subscription
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  )
}
