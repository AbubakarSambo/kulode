import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  CheckmarkCircle02Icon,
  Award01Icon,
  CreditCardIcon,
  Calendar03Icon,
  UserGroupIcon,
  Invoice03Icon,
  AlertDiamondIcon,
  SecurityLockIcon,
  ArrowLeft02Icon
} from '@hugeicons/core-free-icons'
import { Link } from 'react-router-dom'
import { Header } from '@/components/layout'
import { Card, CardContent, Badge } from '@/components/ui'
import { subscriptionApi } from '@/api/subscription'
import { useSubscription } from '@/hooks/useSubscription'
import { Modal } from '@/components/shared'
import { cn } from '@/lib/utils'
import type { PlanTier, BillingPeriod } from '@/types'
import { posthog } from '@/lib/posthog'

const PLAN_FEATURES: Record<string, { name: string; price: { monthly: number; annual: number }; description: string; features: string[] }> = {
  FREE: {
    name: 'Free / Expired',
    price: { monthly: 0, annual: 0 },
    description: 'Legacy or expired account state with restricted access.',
    features: [],
  },
  STARTER: {
    name: 'Starter',
    price: { monthly: 4500, annual: 45000 },
    description: 'Perfect for freelancers and side-hustles starting out.',
    features: [
      'Up to 30 invoices / month',
      '1 active user seat',
      'Clients & Invoices management',
      'Secure client payment link',
      'Instant payouts: Add bank details',
    ],
  },
  PRO: {
    name: 'Pro',
    price: { monthly: 12500, annual: 125000 },
    description: 'For growing businesses needing expense tracking and tax tools.',
    features: [
      'Up to 100 invoices / month',
      'Up to 3 active users',
      'Everything in Starter',
      'Dashboard analytics & Reports',
      'Vendors & Expense tracking',
      'Product Inventory management',
      'Custom Expense Categories',
      'Taxable item split exports',
    ],
  },
  BUSINESS: {
    name: 'Business',
    price: { monthly: 29500, annual: 295000 },
    description: 'For large organizations managing heavy volume and teams.',
    features: [
      'Unlimited invoices / month',
      'Unlimited active users',
      'Everything in Pro',
      'Priority customer support',
      'Compliance checklist audits',
      'Zero platform transaction fees',
    ],
  },
}

function formatAmount(naira: number) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(naira)
}

export function BillingPage() {
  const queryClient = useQueryClient()
  const { subscription, effectivePlan, isGrandfathered, autoRenew } = useSubscription()
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
      posthog.capture('subscription_plan_change_initiated', { plan: subscribingPlan })
      window.location.href = data.paymentUrl
    },
    onError: () => {
      toast.error('Failed to initialize payment. Please try again.')
    },
  })

  const cancelMutation = useMutation({
    mutationFn: subscriptionApi.cancel,
    onSuccess: (data) => {
      posthog.capture('subscription_cancelled')
      toast.success(data.message)
      setShowCancelModal(false)
      queryClient.invalidateQueries({ queryKey: ['subscription'] })
    },
    onError: () => {
      toast.error('Failed to cancel subscription.')
    },
  })

  const toggleAutoRenewMutation = useMutation({
    mutationFn: (enabled: boolean) => subscriptionApi.toggleAutoRenew(enabled),
    onSuccess: (_, enabled) => {
      posthog.capture('subscription_auto_renew_toggled', { enabled })
      toast.success('Auto-renewal settings updated successfully.')
      queryClient.invalidateQueries({ queryKey: ['subscription'] })
    },
    onError: () => {
      toast.error('Failed to update renewal preference.')
    },
  })

  const handleSubscribe = (planTier: PlanTier) => {
    setSubscribingPlan(planTier)
    subscribeMutation.mutate({ planTier, period: billingPeriod })
  }

  const renderStatusBadge = () => {
    if (isGrandfathered) {
      return (
        <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 font-semibold px-3 py-1 rounded-full text-xs flex items-center gap-1.5">
          <HugeiconsIcon icon={SecurityLockIcon} size={14} className="shrink-0" />
          Grandfathered (Lifetime Access)
        </Badge>
      )
    }
    if (!subscription) return null
    switch (subscription.subscriptionStatus) {
      case 'TRIALING':
        return (
          <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 font-semibold px-3 py-1 rounded-full text-xs flex items-center gap-1.5 animate-pulse">
            <HugeiconsIcon icon={Award01Icon} size={14} className="shrink-0 text-amber-500" />
            Trial &middot; {subscription.trialDaysRemaining} days left
          </Badge>
        )
      case 'ACTIVE':
        return (
          <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 font-semibold px-3 py-1 rounded-full text-xs flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping shrink-0" />
            Active
          </Badge>
        )
      case 'CANCELLED':
        return (
          <Badge className="bg-slate-500/10 text-slate-650 dark:text-slate-400 hover:bg-slate-500/20 border border-slate-500/20 font-semibold px-3 py-1 rounded-full text-xs flex items-center gap-1.5">
            Cancelled
          </Badge>
        )
      case 'EXPIRED':
        return (
          <Badge className="bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 font-semibold px-3 py-1 rounded-full text-xs flex items-center gap-1.5">
            <HugeiconsIcon icon={AlertDiamondIcon} size={14} className="shrink-0" />
            Expired
          </Badge>
        )
      default:
        return <Badge variant="outline">{subscription.subscriptionStatus}</Badge>
    }
  }

  // Visual Progress calculations for limits
  const invoicePercent = subscription && subscription.limits.maxInvoicesPerMonth !== Infinity
    ? Math.min(100, (subscription.usage.invoicesThisMonth / subscription.limits.maxInvoicesPerMonth) * 100)
    : 0
  const userPercent = subscription && subscription.limits.maxUsers !== Infinity
    ? Math.min(100, (subscription.usage.activeUsers / subscription.limits.maxUsers) * 100)
    : 0

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[#f8f9ff] dark:bg-slate-950/45">
      <Header
        title="Billing & Plans"
        description="Manage your platform subscription, features, and auto-renewals."
      />

      <div className="flex-1 overflow-auto p-6 sm:p-8 space-y-8 max-w-7xl mx-auto w-full">
        {/* Back link */}
        <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#0037b0] transition-colors">
          <HugeiconsIcon icon={ArrowLeft02Icon} size={14} />
          Back to Dashboard
        </Link>

        {/* Current plan redesigned card */}
        <div className="grid gap-8 lg:grid-cols-3">
          
          {/* Card 1: Subscription Info */}
          <Card className="lg:col-span-2 rounded-[24px] border-0 shadow-[0_12px_32px_rgba(0,55,176,0.04)] overflow-hidden bg-white dark:bg-slate-900">
            <CardContent className="p-8 flex flex-col justify-between h-full space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[#0037b0] dark:text-[#3b82f6]">Your Current Plan</p>
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                    {PLAN_FEATURES[effectivePlan]?.name ?? effectivePlan}
                  </h3>
                  
                  {subscription?.billingPeriod && (
                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-1 font-semibold">
                      <HugeiconsIcon icon={Calendar03Icon} size={14} className="text-slate-400" />
                      <span>
                        {subscription.billingPeriod === 'MONTHLY' ? 'Billed Monthly' : 'Billed Annually'}
                        {subscription.subscriptionEndDate && (
                          <>
                            {' '}&middot;{' '}
                            {subscription.subscriptionStatus === 'CANCELLED'
                              ? `Access until ${new Date(subscription.subscriptionEndDate).toLocaleDateString()}`
                              : `Renews ${new Date(subscription.subscriptionEndDate).toLocaleDateString()}`}
                          </>
                        )}
                      </span>
                    </div>
                  )}
                </div>
                <div>
                  {renderStatusBadge()}
                </div>
              </div>

              {/* Stored Billing Details & Renewal Failed message */}
              {subscription && !isGrandfathered && (
                <div className="border-t border-slate-100 dark:border-slate-800/60 pt-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-950 p-2.5">
                      <HugeiconsIcon icon={CreditCardIcon} size={20} className="text-slate-500" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Payment Authorization</p>
                      <p className="text-[11px] text-slate-500 font-medium">
                        {subscription.subscriptionStatus === 'TRIALING' 
                          ? 'No credit card required for trial'
                          : subscription.subscriptionStatus === 'ACTIVE' 
                            ? 'Secure card authorization saved via Paystack'
                            : 'No payment token active'}
                      </p>
                    </div>
                  </div>

                  {subscription?.subscriptionStatus === 'ACTIVE' && (
                    <button
                      onClick={() => setShowCancelModal(true)}
                      className="text-xs font-semibold text-rose-500 hover:text-rose-600 transition-colors py-1.5 px-3 rounded-lg hover:bg-rose-500/5 cursor-pointer min-h-[44px] flex items-center justify-center"
                    >
                      Cancel Subscription
                    </button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Card 2: Current Usage Progress */}
          <Card className="rounded-[24px] border-0 shadow-[0_12px_32px_rgba(0,55,176,0.04)] bg-white dark:bg-slate-900 overflow-hidden">
            <CardContent className="p-8 flex flex-col justify-between h-full space-y-6">
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Monthly Account Usage</p>
                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Active Limits</h4>
              </div>

              {subscription && !isGrandfathered ? (
                <div className="space-y-4 flex-1 flex flex-col justify-center">
                  {/* Progress Bar 1: Invoices */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs font-semibold text-slate-700 dark:text-slate-300">
                      <span className="flex items-center gap-1.5">
                        <HugeiconsIcon icon={Invoice03Icon} size={14} className="text-slate-400" /> Invoices Created
                      </span>
                      <span className="font-semibold">
                        {subscription.usage.invoicesThisMonth} / {subscription.limits.maxInvoicesPerMonth === Infinity ? '∞' : subscription.limits.maxInvoicesPerMonth}
                      </span>
                    </div>
                    <div className="w-full bg-[#eef4ff] dark:bg-slate-800 rounded-full h-2">
                      <div 
                        className={cn("h-2 rounded-full transition-all duration-500", invoicePercent > 80 ? "bg-amber-500" : "bg-[#0037b0]")}
                        style={{ width: `${invoicePercent}%` }} 
                      />
                    </div>
                  </div>

                  {/* Progress Bar 2: Users */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs font-semibold text-slate-700 dark:text-slate-300">
                      <span className="flex items-center gap-1.5">
                        <HugeiconsIcon icon={UserGroupIcon} size={14} className="text-slate-400" /> Team Seats
                      </span>
                      <span className="font-semibold">
                        {subscription.usage.activeUsers} / {subscription.limits.maxUsers === Infinity ? '∞' : subscription.limits.maxUsers}
                      </span>
                    </div>
                    <div className="w-full bg-[#eef4ff] dark:bg-slate-800 rounded-full h-2">
                      <div 
                        className={cn("h-2 rounded-full transition-all duration-500", userPercent > 80 ? "bg-amber-500" : "bg-[#006c49]")}
                        style={{ width: `${userPercent}%` }} 
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 text-slate-400 text-xs flex flex-col items-center gap-2">
                  <HugeiconsIcon icon={SecurityLockIcon} size={28} className="text-[#0037b0] animate-pulse" />
                  <span className="font-semibold">Unlimited lifetime resources active.</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Auto-renew Toggle */}
        {subscription && subscription.subscriptionStatus === 'ACTIVE' && !isGrandfathered && (
          <Card className="rounded-[24px] border-0 shadow-[0_12px_32px_rgba(0,55,176,0.04)] bg-white dark:bg-slate-900 overflow-hidden">
            <CardContent className="p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1 max-w-xl">
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <span>Automatic Card Renewals</span>
                  <Badge className={cn("text-[9px] font-bold px-2 py-0.5 border-0", autoRenew ? "bg-[#6ffbbe] text-[#006c49]" : "bg-slate-100 text-slate-500")}>
                    {autoRenew ? 'Enabled' : 'Disabled'}
                  </Badge>
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed font-medium">
                  {autoRenew
                    ? 'Your connected credit card will be automatically charged on each renewal cycle to keep services active.'
                    : 'Auto-renewal is disabled. We will not charge your card. You will need to manually subscribe on the expiration date to prevent lockout.'}
                </p>
              </div>
              <button
                onClick={() => toggleAutoRenewMutation.mutate(!autoRenew)}
                disabled={toggleAutoRenewMutation.isPending}
                className={cn(
                  "relative inline-flex h-6.5 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#0037b0] focus:ring-offset-2 min-h-[44px]",
                  autoRenew ? "bg-[#0037b0]" : "bg-slate-200 dark:bg-slate-800"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-5.5 w-5.5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out mt-0.5",
                    autoRenew ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
            </CardContent>
          </Card>
        )}

        {/* Plan pricing tables header */}
        {!isGrandfathered && (
          <div className="pt-8 space-y-4">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold text-slate-950 dark:text-white tracking-tight">Select Subscription Plan</h2>
              <p className="text-sm text-slate-500 max-w-lg mx-auto font-medium">
                Choose the pricing plan that matches your monthly billing and user needs. Toggle below to save 17% on annual cycles.
              </p>
            </div>

            {/* Toggle Billing Period with modern sliding container */}
            <div className="flex justify-center pt-2">
              <div className="bg-[#eef4ff] dark:bg-slate-900 p-1 rounded-2xl flex items-center shadow-inner relative max-w-xs w-full">
                <button
                  onClick={() => setBillingPeriod('MONTHLY')}
                  className={cn(
                    "flex-1 py-2 px-4 text-xs font-semibold rounded-xl transition-all duration-200 z-10 cursor-pointer min-h-[44px] flex items-center justify-center",
                    billingPeriod === 'MONTHLY'
                      ? "bg-[#0037b0] text-white shadow-sm font-bold"
                      : "text-slate-650 hover:text-slate-905 dark:text-slate-400"
                  )}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setBillingPeriod('ANNUAL')}
                  className={cn(
                    "flex-1 py-2 px-4 text-xs font-semibold rounded-xl transition-all duration-200 z-10 cursor-pointer flex items-center justify-center gap-1.5 min-h-[44px]",
                    billingPeriod === 'ANNUAL'
                      ? "bg-[#0037b0] text-white shadow-sm font-bold"
                      : "text-slate-650 hover:text-slate-905 dark:text-slate-400"
                  )}
                >
                  <span>Annual</span>
                  <span className="bg-[#6ffbbe] text-[#006c49] text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                    -17%
                  </span>
                </button>
              </div>
            </div>

            {/* Redesigned Pricing cards grid */}
            <div className="grid gap-6 md:grid-cols-3 items-stretch pt-4">
              {(Object.entries(PLAN_FEATURES) as [PlanTier, typeof PLAN_FEATURES[string]][]).map(
                ([tier, plan]) => {
                  if (tier === 'FREE') return null
                  const isTrialing = subscription?.subscriptionStatus === 'TRIALING'
                  const isCurrent = !isTrialing && effectivePlan === tier
                  const price = billingPeriod === 'MONTHLY' ? plan.price.monthly : plan.price.annual
                  const isUpgrade = !isCurrent

                  // Premium card design tokens
                  const isPro = tier === 'PRO'
                  const cardStyles = isPro
                    ? "relative border-2 border-[#0037b0] shadow-[0_12px_32px_rgba(0,55,176,0.08)] bg-white dark:bg-slate-900 scale-[1.02] z-10"
                    : "relative border-0 bg-white dark:bg-slate-900 shadow-[0_12px_32px_rgba(0,55,176,0.02)]"

                  const buttonStyles = isCurrent
                    ? "w-full rounded-xl bg-slate-50 dark:bg-slate-800/50 py-3.5 text-xs font-semibold text-slate-400 dark:text-slate-500 cursor-default text-center min-h-[44px] flex items-center justify-center"
                    : isPro
                      ? "w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0037b0] to-[#1d4ed8] py-3.5 text-xs font-bold text-white shadow-md hover:shadow-lg hover:from-[#0037b0]/95 hover:to-blue-600/95 active:scale-[0.99] transition-all duration-150 cursor-pointer min-h-[44px]"
                      : tier === 'BUSINESS'
                        ? "w-full flex items-center justify-center gap-2 rounded-xl bg-slate-950 dark:bg-slate-50 text-white dark:text-slate-950 py-3.5 text-xs font-bold hover:bg-slate-900 dark:hover:bg-slate-100 transition-all duration-150 cursor-pointer shadow-sm min-h-[44px]"
                        : "w-full flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-250 py-3.5 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-900 transition-all duration-150 cursor-pointer min-h-[44px]"

                  return (
                    <Card
                      key={tier}
                      className={cn("flex flex-col justify-between rounded-[24px] p-2 transition-all duration-300 hover:shadow-md", cardStyles)}
                    >
                      {isPro && (
                        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                          <Badge className="bg-[#0037b0] hover:bg-[#0037b0]/90 text-white font-bold px-4 py-1 text-[9px] uppercase tracking-widest rounded-full shadow-md border-0">
                            Most Popular
                          </Badge>
                        </div>
                      )}

                      <div className="p-6 sm:p-8 flex-1 flex flex-col justify-between h-full space-y-8">
                        <div>
                          {/* Card Top Details */}
                          <div className="space-y-4">
                            <div className="space-y-1">
                              <h3 className="text-xl font-bold text-slate-950 dark:text-white tracking-tight">{plan.name}</h3>
                              <p className="text-xs text-slate-500 font-medium leading-relaxed">{plan.description}</p>
                            </div>
                            
                            <div className="flex items-baseline gap-1 pt-2">
                              <span className="text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
                                {price === 0 ? 'Free' : formatAmount(price)}
                              </span>
                              {price > 0 && (
                                <span className="text-xs text-slate-500 font-semibold">
                                  /{billingPeriod === 'MONTHLY' ? 'mo' : 'yr'}
                                </span>
                              )}
                            </div>
                            {billingPeriod === 'ANNUAL' && price > 0 && (
                              <p className="text-[10px] text-[#006c49] font-bold tracking-wide uppercase">
                                Billed annually ({formatAmount(price)})
                              </p>
                            )}
                          </div>

                          {/* List of Plan Features */}
                          <ul className="space-y-4 border-t border-slate-100 dark:border-slate-800/80 pt-6 mt-6">
                            {plan.features.map((feature) => (
                              <li key={feature} className="flex items-start gap-3 text-xs text-slate-650 dark:text-slate-350 leading-relaxed font-medium">
                                <HugeiconsIcon
                                  icon={CheckmarkCircle02Icon}
                                  size={16}
                                  className={cn("mt-0.5 shrink-0", isPro ? "text-[#0037b0]" : "text-[#006c49]")}
                                />
                                <span>{feature}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* CTA Subscribing Action */}
                        <div className="pt-2">
                          {isCurrent ? (
                            <div className={buttonStyles}>
                              Current Subscription
                            </div>
                          ) : (
                            <button
                              onClick={() => handleSubscribe(tier)}
                              disabled={subscribeMutation.isPending && subscribingPlan === tier}
                              className={buttonStyles}
                            >
                              {subscribeMutation.isPending && subscribingPlan === tier ? (
                                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                              ) : (
                                <HugeiconsIcon icon={Award01Icon} size={16} className="shrink-0" />
                              )}
                              <span>{isUpgrade ? 'Upgrade to ' : 'Select '} {plan.name}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </Card>
                  )
                }
              )}
            </div>
          </div>
        )}

        {/* Payment history redesigned section */}
        {paymentHistory && paymentHistory.length > 0 && (
          <div className="pt-8 space-y-4">
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-950 dark:text-white tracking-tight">Payment Receipts</h3>
              <p className="text-xs text-slate-500 font-medium">
                Review your billing logs and transaction history for verification.
              </p>
            </div>
            
            <Card className="rounded-[24px] border-0 shadow-[0_12px_32px_rgba(0,55,176,0.02)] bg-white dark:bg-slate-900 overflow-hidden">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-transparent text-xs font-semibold uppercase tracking-wider text-slate-500 select-none">
                        <th className="p-4 pl-6">Date</th>
                        <th className="p-4">Subscribed Plan</th>
                        <th className="p-4">Billing Cycle</th>
                        <th className="p-4 text-right">Amount Charged</th>
                        <th className="p-4 pr-6">Paystack Reference</th>
                      </tr>
                    </thead>
                    <tbody className="text-xs text-slate-700 dark:text-slate-350">
                      {paymentHistory.map((payment, index) => (
                        <tr
                          key={payment.id}
                          className={cn(
                            "hover:bg-[#eef4ff]/50 dark:hover:bg-slate-900/40 transition-colors",
                            index % 2 === 1 ? "bg-[#f8f9ff] dark:bg-slate-900/20" : ""
                          )}
                        >
                          <td className="p-4 pl-6 font-semibold">{new Date(payment.paidAt).toLocaleDateString()}</td>
                          <td className="p-4 font-semibold">{payment.planTier}</td>
                          <td className="p-4">
                            <Badge className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-semibold px-2 py-0.5 text-[10px] rounded-md border-0">
                              {payment.billingPeriod}
                            </Badge>
                          </td>
                          <td className="p-4 text-right font-semibold text-slate-900 dark:text-slate-100">{formatAmount(Number(payment.amount))}</td>
                          <td className="p-4 pr-6 font-mono text-[10px] text-slate-550">{payment.paystackReference}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Cancel modal */}
        <Modal
          isOpen={showCancelModal}
          onClose={() => setShowCancelModal(false)}
          title="Cancel Subscription"
        >
          <div className="space-y-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 dark:bg-rose-950/20 text-rose-500">
              <HugeiconsIcon icon={AlertDiamondIcon} size={24} />
            </div>
            <div className="space-y-2">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Are you absolutely sure?</h3>
              <p className="text-xs text-slate-500 leading-relaxed font-medium">
                By cancelling your subscription, your card will not be automatically billed again. You will continue to maintain access to your plan benefits until the end of the current billing cycle, after which your account limits will expire and trigger a locking page.
              </p>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowCancelModal(false)}
                className="rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-650 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-pointer min-h-[44px]"
              >
                Keep Subscription
              </button>
              <button
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
                className="flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-rose-500 shadow-md shadow-rose-600/10 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 min-h-[44px]"
              >
                {cancelMutation.isPending && (
                  <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                )}
                Confirm Cancellation
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  )
}
