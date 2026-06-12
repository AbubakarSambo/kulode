import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { XCircle, Loader2, Check } from 'lucide-react'
import { Button, Input, Label, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui'
import { authApi } from '@/api'
import { useSetPassword } from '@/hooks'

const PASSWORD_RULES = [
  { label: 'At least 8 characters', test: (v: string) => v.length >= 8 },
  { label: 'One uppercase letter', test: (v: string) => /[A-Z]/.test(v) },
]

const passwordSchema = z.object({
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain an uppercase letter'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

type PasswordForm = z.infer<typeof passwordSchema>

export function SetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const setPassword = useSetPassword()

  const [validating, setValidating] = useState(true)
  const [valid, setValid] = useState(false)
  const [tokenInfo, setTokenInfo] = useState<{ email?: string; firstName?: string }>({})

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
  })

  const passwordValue = watch('password', '')

  useEffect(() => {
    if (!token) {
      setValidating(false)
      return
    }

    authApi.validateToken(token, 'PASSWORD_SETUP').then((result) => {
      setValid(result.valid)
      setTokenInfo({ email: result.email, firstName: result.firstName })
      setValidating(false)
    }).catch(() => {
      setValidating(false)
    })
  }, [token])

  const onSubmit = (data: PasswordForm) => {
    if (!token) return
    setPassword.mutate({ token, password: data.password })
  }

  if (validating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Loader2 className="mx-auto mb-4 h-16 w-16 animate-spin text-primary" />
            <CardTitle>Validating invitation...</CardTitle>
          </CardHeader>
        </Card>
      </div>
    )
  }

  if (!token || !valid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <XCircle className="mx-auto mb-4 h-16 w-16 text-destructive" />
            <CardTitle>Invalid or expired link</CardTitle>
            <CardDescription>
              This invitation link is invalid or has expired. Please ask your admin to resend the invite.
            </CardDescription>
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mb-4 flex justify-center">
            <img src="/logo.svg" alt="Tari1" className="h-10 w-auto" />
          </div>
          <CardTitle>One last step</CardTitle>
          <CardDescription>
            {tokenInfo.firstName ? `Welcome, ${tokenInfo.firstName}! S` : 'S'}et a password to secure your account
            {tokenInfo.email && <> for <strong>{tokenInfo.email}</strong></>}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                {...register('password')}
                error={errors.password?.message}
              />
              <ul className="space-y-1 pt-1">
                {PASSWORD_RULES.map((rule) => {
                  const met = rule.test(passwordValue)
                  return (
                    <li key={rule.label} className={`flex items-center gap-2 text-xs ${met ? 'text-green-600' : 'text-muted-foreground'}`}>
                      <Check className={`h-3 w-3 shrink-0 ${met ? 'opacity-100' : 'opacity-30'}`} />
                      {rule.label}
                    </li>
                  )
                })}
              </ul>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                {...register('confirmPassword')}
                error={errors.confirmPassword?.message}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" isLoading={setPassword.isPending}>
              Set Password & Continue
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
