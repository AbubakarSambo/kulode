import { useEffect, useRef, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui'
import { useVerifyEmail, useResendVerification } from '@/hooks'

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const verify = useVerifyEmail()
  const resend = useResendVerification()
  const [email, setEmail] = useState('')
  const hasVerified = useRef(false)

  useEffect(() => {
    if (token && !hasVerified.current) {
      hasVerified.current = true
      verify.mutate(token)
    }
  }, [token])

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <XCircle className="mx-auto mb-4 h-16 w-16 text-destructive" />
            <CardTitle>Invalid link</CardTitle>
            <CardDescription>No verification token found in the URL.</CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Link to="/login" className="text-primary hover:underline text-sm">
              Go to login
            </Link>
          </CardFooter>
        </Card>
      </div>
    )
  }

  if (verify.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Loader2 className="mx-auto mb-4 h-16 w-16 animate-spin text-primary" />
            <CardTitle>Verifying your email...</CardTitle>
            <CardDescription>Please wait a moment.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  if (verify.isError) {
    const message = (verify.error as any)?.response?.data?.message || 'Verification failed'

    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <XCircle className="mx-auto mb-4 h-16 w-16 text-destructive" />
            <CardTitle>Verification failed</CardTitle>
            <CardDescription>{message}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <input
                type="email"
                placeholder="Enter your email to resend"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <Button
                variant="outline"
                className="w-full"
                onClick={() => email && resend.mutate(email)}
                isLoading={resend.isPending}
                disabled={!email}
              >
                Resend verification email
              </Button>
            </div>
          </CardContent>
          <CardFooter className="justify-center">
            <Link to="/login" className="text-primary hover:underline text-sm">
              Back to login
            </Link>
          </CardFooter>
        </Card>
      </div>
    )
  }

  // Success state (brief flash before redirect)
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CheckCircle className="mx-auto mb-4 h-16 w-16 text-green-500" />
          <CardTitle>Email verified!</CardTitle>
          <CardDescription>Redirecting to dashboard...</CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}
