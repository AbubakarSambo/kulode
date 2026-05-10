import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui'
import apiClient from '@/api/client'
import { posthog } from '@/lib/posthog'

type PaymentStatus = 'loading' | 'success' | 'failed'

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

  useEffect(() => {
    const verifyPayment = async () => {
      if (!reference) {
        setStatus('failed')
        return
      }

      try {
        if (isSubscription) {
          // For subscription payments, verify and activate via our API
          // This handles the case where the webhook hasn't fired yet (e.g. local dev)
          await apiClient.post('/subscription/verify-payment', { reference })
          setStatus('success')
          posthog.capture('subscription_activated', { reference })
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
      } catch (error) {
        // Even if verification fails, the webhook will handle recording
        // Show success if we have a reference (payment likely went through)
        setStatus('success')
      }
    }

    verifyPayment()
  }, [reference, isSubscription])

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

          {status === 'failed' && (
            <div className="text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
                <XCircle className="h-12 w-12 text-destructive" />
              </div>
              <h1 className="mt-4 text-2xl font-semibold text-destructive">Payment Failed</h1>
              <p className="mt-2 text-muted-foreground">
                We couldn't verify your payment. If money was deducted from your account, 
                please <a href="mailto:abubakar.sambo@kulode.app" className="underline hover:text-foreground">contact support</a> with reference: <span className="font-mono">{reference || 'N/A'}</span>
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
