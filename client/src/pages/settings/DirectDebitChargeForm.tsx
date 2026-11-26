import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Input, Label, Select } from '@/components/ui'
import { subscriptionApi, type DirectDebitChargeResult } from '@/api/subscription'
import type { BillingPeriod, PlanTier } from '@/types'
import { posthog } from '@/lib/posthog'

/** Local Nigerian numbers (0801…) are sent in the international form Paystack expects. */
const toInternationalPhone = (value: string) => {
  const compact = value.replace(/[\s()-]/g, '')
  if (/^0\d{10}$/.test(compact)) return `+234${compact.slice(1)}`
  if (/^234\d{10}$/.test(compact)) return `+${compact}`
  return compact
}

interface Props {
  planTier: PlanTier
  billingPeriod: BillingPeriod
  priceLabel: string
}

/** Pays for the plan from a bank account and sets that account up for renewals. */
export function DirectDebitChargeForm({ planTier, billingPeriod, priceLabel }: Props) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ bankCode: '', accountNumber: '', street: '', city: '', state: '', phone: '' })
  const [outcome, setOutcome] = useState<DirectDebitChargeResult | null>(null)

  const banks = useQuery({
    queryKey: ['subscription', 'direct-debit-banks'],
    queryFn: subscriptionApi.getDirectDebitBanks,
    staleTime: 60 * 60 * 1000,
  })

  const charge = useMutation({
    mutationFn: () =>
      subscriptionApi.chargeDirectDebit({ ...form, phone: toInternationalPhone(form.phone), planTier, billingPeriod }),
    onSuccess: (result) => {
      posthog.capture('direct_debit_charge_started', { status: result.status, period: billingPeriod })
      if (result.status === 'open_url') {
        window.location.href = result.redirectUrl
        return
      }
      if (result.status === 'success') {
        window.location.href = `/payment/callback?type=subscription&reference=${encodeURIComponent(result.reference)}`
        return
      }
      setOutcome(result)
      queryClient.invalidateQueries({ queryKey: ['subscription'] })
    },
    onError: (error: { response?: { data?: { message?: string | string[] } } }) => {
      const message = error?.response?.data?.message
      toast.error((Array.isArray(message) ? message[0] : message) || 'Could not start the bank payment. Please try again.')
    },
  })

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: e.target.value }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    charge.mutate()
  }

  if (outcome?.status === 'pending_bank_transfer') {
    const { transfer } = outcome
    return (
      <div className="space-y-3 text-left" role="status">
        <p className="text-sm font-bold">Make a one-time transfer to confirm your account</p>
        <dl className="space-y-1.5 rounded-xl border p-4 text-sm">
          {[
            ['Amount', transfer.amount && `₦${transfer.amount}`],
            ['Bank', transfer.bankName],
            ['Account number', transfer.accountNumber],
            ['Account name', transfer.accountName],
          ].map(([label, value]) =>
            value ? (
              <div key={label} className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-semibold">{value}</dd>
              </div>
            ) : null,
          )}
        </dl>
        <p className="text-xs text-muted-foreground">
          Send it from the account you entered. Your bank can take up to 24 hours to confirm, and your plan switches
          on once the payment is received. Reference: <span className="font-mono">{outcome.reference}</span>
        </p>
      </div>
    )
  }

  if (outcome) {
    return (
      <p className="text-sm" role="status">
        Your bank is processing the payment. Your plan switches on once it is received. Reference:{' '}
        <span className="font-mono">{outcome.reference}</span>
      </p>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-3 text-left">
      <div className="space-y-1">
        <Label htmlFor="dd-bank">Bank</Label>
        <Select id="dd-bank" required value={form.bankCode} onChange={set('bankCode')}>
          <option value="">{banks.isLoading ? 'Loading banks…' : 'Choose your bank'}</option>
          {banks.data?.map((bank) => (
            <option key={bank.code} value={bank.code}>
              {bank.name}
            </option>
          ))}
        </Select>
        {banks.isError && <p className="text-xs text-destructive">Could not load the list of banks.</p>}
      </div>
      <div className="space-y-1">
        <Label htmlFor="dd-account">Account number</Label>
        <Input id="dd-account" required inputMode="numeric" pattern="\d{10}" maxLength={10} title="10 digits" value={form.accountNumber} onChange={set('accountNumber')} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="dd-phone">Phone number</Label>
        <Input id="dd-phone" required type="tel" autoComplete="tel" placeholder="08012345678" value={form.phone} onChange={set('phone')} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="dd-street">Street address</Label>
        <Input id="dd-street" required autoComplete="street-address" maxLength={200} value={form.street} onChange={set('street')} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="dd-city">City</Label>
          <Input id="dd-city" required maxLength={100} value={form.city} onChange={set('city')} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="dd-state">State</Label>
          <Input id="dd-state" required maxLength={100} value={form.state} onChange={set('state')} />
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        By paying you authorise this account to be debited for this payment and for your renewals.
      </p>
      <button
        type="submit"
        disabled={charge.isPending}
        className="w-full rounded-xl bg-gradient-to-r from-[#0037b0] to-[#1d4ed8] py-3.5 text-xs font-bold text-white shadow-md cursor-pointer min-h-[44px] disabled:opacity-60"
      >
        {charge.isPending ? 'Contacting your bank…' : `Pay ${priceLabel} from my bank`}
      </button>
    </form>
  )
}
