import type { SubscriptionDetails } from '@/types'

type PaymentMethods = NonNullable<SubscriptionDetails['paymentMethods']>

/**
 * What the Billing page says about how a plan renews, based on what is actually saved. A linked bank
 * account is debited first and a card is the fallback; terms longer than a month are only taken from
 * a bank for test accounts, whose price is under the bank limit.
 */
export function renewalWording(
  subscription: Pick<SubscriptionDetails, 'billingPeriod' | 'isTestAccount' | 'paymentMethods'> | null | undefined,
) {
  const methods: PaymentMethods | undefined = subscription?.paymentMethods
  const card = methods?.card
  const dd = methods?.directDebit
  const bankLinked = dd?.status === 'ACTIVE'
  const bankCoversTerm = subscription?.billingPeriod === 'MONTHLY' || !!subscription?.isTestAccount
  const useBank = bankLinked && bankCoversTerm
  const bank = dd?.bankName ? `${dd.bankName}${dd.last4 ? ` •••• ${dd.last4}` : ''}` : 'your bank account'

  const authorization =
    bankLinked && card
      ? 'Bank account and card saved securely via Paystack'
      : bankLinked
        ? 'Secure bank authorization saved via Paystack'
        : card
          ? 'Secure card authorization saved via Paystack'
          : 'No payment method saved'

  let enabled: string
  if (useBank && card) enabled = `Each renewal is taken from ${bank}. If that debit fails, your card is charged instead.`
  else if (useBank) enabled = `Each renewal is taken from ${bank}. If a debit fails, we will email you.`
  else if (card) enabled = 'Your card will be automatically charged on each renewal cycle to keep services active.'
  else if (bankLinked) enabled = 'This term is too large to take from your bank account and no card is saved, so it will not renew automatically.'
  else enabled = 'No payment method is saved, so this plan will not renew automatically.'

  return {
    authorization,
    useBank,
    enabled,
    disabled: 'Auto-renewal is disabled. We will not charge you automatically. You will need to subscribe again on the expiration date to prevent lockout.',
  }
}
