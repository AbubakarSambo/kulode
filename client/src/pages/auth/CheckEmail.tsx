import { useState, useEffect } from 'react'
import { Link, useLocation, Navigate } from 'react-router-dom'
import { Mail } from 'lucide-react'
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui'
import { useResendVerification } from '@/hooks'
import apiClient from '@/api/client'

export function CheckEmailPage() {
  const location = useLocation()
  const email = location.state?.email as string | undefined
  const variant = location.state?.variant as 'reset' | undefined
  const resend = useResendVerification()
  const [devToken, setDevToken] = useState<string | null>(null)

  useEffect(() => {
    if (import.meta.env.DEV && email) {
      const fetchToken = async () => {
        try {
          const response = await apiClient.get(`/auth/dev/latest-token?email=${encodeURIComponent(email)}`)
          if (response.data?.token) {
            setDevToken(response.data.token)
          }
        } catch (err) {
          console.error('Failed to fetch dev token:', err)
        }
      }
      fetchToken()
      const interval = setInterval(fetchToken, 3000)
      return () => clearInterval(interval)
    }
  }, [email])

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

          {import.meta.env.DEV && devToken && (
            <div className="mt-6 p-4 rounded-xl bg-[#eef4ff]/80 border border-[#0037b0]/10 text-left animate-in fade-in duration-200">
              <span className="inline-block text-[10px] font-bold text-[#0037b0] bg-[#0037b0]/5 px-2 py-0.5 rounded-full uppercase tracking-wider mb-2">
                ⚡ Dev Mode Helper
              </span>
              <p className="text-xs font-semibold text-slate-700 leading-normal mb-3">
                Since you are running locally, you can click the button below to simulate email verification and proceed:
              </p>
              <Link
                to={`/verify-email?token=${devToken}`}
                className="w-full h-11 bg-gradient-to-r from-[#0037b0] to-[#1d4ed8] text-white rounded-xl font-bold text-xs shadow-md hover:opacity-95 flex items-center justify-center transition-all active:scale-98 min-h-[44px]"
              >
                Verify {email}
              </Link>
            </div>
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
