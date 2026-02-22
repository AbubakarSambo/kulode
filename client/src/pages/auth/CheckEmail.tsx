import { Link, useLocation, Navigate } from 'react-router-dom'
import { Mail } from 'lucide-react'
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui'
import { useResendVerification } from '@/hooks'

export function CheckEmailPage() {
  const location = useLocation()
  const email = location.state?.email as string | undefined
  const variant = location.state?.variant as 'reset' | undefined
  const resend = useResendVerification()

  if (!email) {
    return <Navigate to="/register" replace />
  }

  const isReset = variant === 'reset'

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Mail className="h-8 w-8 text-primary" />
          </div>
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            {isReset
              ? <>We sent a password reset link to <strong>{email}</strong></>
              : <>We sent a verification link to <strong>{email}</strong></>}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground">
          {isReset ? (
            <>
              <p>Click the link in the email to reset your password.</p>
              <p className="mt-2">Didn't receive the email? Check your spam folder.</p>
            </>
          ) : (
            <>
              <p>Click the link in the email to verify your account and get started.</p>
              <p className="mt-2">Didn't receive the email? Check your spam folder or resend it.</p>
            </>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          {!isReset && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => resend.mutate(email)}
              isLoading={resend.isPending}
            >
              Resend verification email
            </Button>
          )}
          <p className="text-center text-sm text-muted-foreground">
            <Link to="/login" className="text-primary hover:underline">
              Back to login
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}
