import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui'
import apiClient from '@/api/client'
import { posthog } from '@/lib/posthog'

type PaymentStatus = 'loading' | 'success' | 'failed' | 'processing' | 'unconfirmed'

// Verification can fail for reasons that say nothing about the payment (network blip, expired
// session, server error). Retry a few times, then say plainly that we could not confirm it —
// never show a success screen for a payment we have not confirmed.
const VERIFY_ATTEMPTS = 3
const VERIFY_RETRY_DELAY_MS = 2000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// A 400 is the API saying the payment itself did not verify, which is a real answer, not an outage.
const isDefinitiveFailure = (error: unknown) =>
  (error as { response?: { status?: number } })?.response?.status === 400

interface VerificationResult {
  status: string
  amount: number
  currency: string
  reference: string
  invoiceNumber?: string
}

export function PaymentCallbackPage() {
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState<PaymentStatus>('loading')
  const [details, setDetails] = useState<VerificationResult | null>(null)

  const reference = searchParams.get('reference') || searchParams.get('trxref')
  const isSubscription = searchParams.get('type') === 'subscription'
  // Linking a bank account takes no payment, so there is nothing to verify here: the bank confirms
  // the mandate in its own time and Paystack tells our server when it is ready.
  const isDirectDebit = searchParams.get('type') === 'direct_debit'

  useEffect(() => {
    if (isDirectDebit) return
    const verifyPayment = async () => {
      if (!reference) {
        setStatus('failed')
        return
      }

      for (let attempt = 1; attempt <= VERIFY_ATTEMPTS; attempt++) {
        try {
          if (isSubscription) {
            // Verify and activate via our API. This is the path that records the payment when the
            // Paystack webhook has not (or cannot) reach us.
            const response = await apiClient.post('/subscription/verify-payment', { reference })
            // A bank-account payment is still settling: the plan is switched on for a short grace
            // and confirms by itself once the bank completes the debit.
            if (response?.data?.data?.pending) {
              setStatus('processing')
              posthog.capture('subscription_bank_payment_processing', { reference })
            } else {
              setStatus('success')
              posthog.capture('subscription_activated', { reference })
            }
          } else {
            // Verify the transaction with Paystack via our API
            const response = await apiClient.get(`/paystack/verify/${reference}`)
            const data = response.data.data

            if (data.status === 'success') {
              setStatus('success')
              setDetails(data)
              posthog.capture('payment_callback_received', { status: 'success', reference })
            } else {
              setStatus('failed')
              posthog.capture('payment_callback_received', { status: 'failed', reference })
            }
          }
          return
        } catch (error) {
          if (isDefinitiveFailure(error)) {
            setStatus('failed')
            posthog.capture('payment_callback_received', { status: 'failed', reference })
            return
          }
          if (attempt < VERIFY_ATTEMPTS) {
            await sleep(VERIFY_RETRY_DELAY_MS)
          } else {
            setStatus('unconfirmed')
            posthog.capture('payment_callback_unconfirmed', { reference, subscription: isSubscription })
          }
        }
      }
    }

    verifyPayment()
  }, [reference, isSubscription, isDirectDebit])

  if (isDirectDebit) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
              <CheckCircle className="h-12 w-12 text-success" />
            </div>
            <h1 className="mt-4 text-2xl font-semibold text-success">Bank account submitted</h1>
            <p className="mt-2 text-muted-foreground">
              Your bank may take a few hours to confirm it. Once it does, your renewals will be taken from
              this account. You don't need to do anything else.
            </p>
            <p className="mt-6 text-sm">
              <a href="/settings/billing" className="font-medium text-primary hover:underline">
                Back to Billing
              </a>
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          {status === 'loading' && (
            <div className="text-center">
              <Loader2 className="mx-auto h-16 w-16 animate-spin text-primary" />
              <h1 className="mt-4 text-xl font-semibold">Verifying Payment</h1>
              <p className="mt-2 text-muted-foreground">
                Please wait while we confirm your payment...
              </p>
            </div>
          )}

          {status === 'processing' && (
            <div className="text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
                <CheckCircle className="h-12 w-12 text-success" />
              </div>
              <h1 className="mt-4 text-2xl font-semibold text-success">Your plan is active</h1>
              <p className="mt-2 text-muted-foreground">
                Your bank is still processing the payment, which can take a few hours. You can use your plan
                now. If the payment has not gone through within 24 hours, your plan will lapse.
              </p>
              <p className="mt-6 text-sm">
                <a href="/dashboard" className="font-medium text-primary hover:underline">
                  Go to Dashboard
                </a>
              </p>
            </div>
          )}

          {status === 'success' && (
            <div className="text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
                <CheckCircle className="h-12 w-12 text-success" />
              </div>
              <h1 className="mt-4 text-2xl font-semibold text-success">
                {isSubscription ? 'Subscription Activated!' : 'Payment Successful!'}
              </h1>
              <p className="mt-2 text-muted-foreground">
                {isSubscription
                  ? 'Your subscription has been activated. Enjoy your upgraded plan!'
                  : 'Thank you for your payment. A receipt has been sent to your email.'}
              </p>

              {details && !isSubscription && (
                <div className="mt-6 rounded-lg border bg-muted/50 p-4 text-left">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Reference</span>
                      <span className="font-mono text-sm">{reference}</span>
                    </div>
                    {details.invoiceNumber && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Invoice</span>
                        <span className="font-medium">{details.invoiceNumber}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <p className="mt-6 text-sm text-muted-foreground">
                {isSubscription ? (
                  <a href="/dashboard" className="font-medium text-primary hover:underline">
                    Go to Dashboard
                  </a>
                ) : (
                  'You can close this window now.'
                )}
              </p>
            </div>
          )}

          {status === 'unconfirmed' && (
            <div className="text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-warning/10">
                <Loader2 className="h-12 w-12 text-warning" />
              </div>
              <h1 className="mt-4 text-2xl font-semibold">We're still confirming your payment</h1>
              <p className="mt-2 text-muted-foreground">
                We couldn't confirm your payment just now, so it isn't showing on your account yet. If money
                was deducted, please{' '}
                <a href="mailto:abubakar.sambo@tarione.com" className="underline hover:text-foreground">
                  contact support
                </a>{' '}
                with reference: <span className="font-mono">{reference || 'N/A'}</span>
              </p>
              <p className="mt-6 text-sm">
                <button type="button" onClick={() => window.location.reload()} className="font-medium text-primary hover:underline">
                  Try again
                </button>
              </p>
            </div>
          )}

          {status === 'failed' && (
            <div className="text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
                <XCircle className="h-12 w-12 text-destructive" />
              </div>
              <h1 className="mt-4 text-2xl font-semibold text-destructive">Payment Failed</h1>
              <p className="mt-2 text-muted-foreground">
                We couldn't verify your payment. If money was deducted from your account, 
                please <a href="mailto:abubakar.sambo@tarione.com" className="underline hover:text-foreground">contact support</a> with reference: <span className="font-mono">{reference || 'N/A'}</span>
              </p>
              <p className="mt-6 text-sm text-muted-foreground">
                You can close this window and try again.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
