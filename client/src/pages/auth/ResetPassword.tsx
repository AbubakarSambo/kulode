import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { XCircle, Loader2, Check, Eye, EyeOff } from 'lucide-react'
import { Button, Input, Label, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui'
import { Logo } from '@/components/shared'
import { authApi } from '@/api'
import { useResetPassword } from '@/hooks'

const PASSWORD_RULES = [
  { label: 'At least 8 characters', test: (v: string) => v.length >= 8 },
  { label: 'One uppercase letter', test: (v: string) => /[A-Z]/.test(v) },
  { label: 'One number or special character', test: (v: string) => /[\d\W]/.test(v) },
]

const passwordSchema = z.object({
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain an uppercase letter')
    .regex(/[\d\W]/, 'Must contain a number or special character'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

type PasswordForm = z.infer<typeof passwordSchema>

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const resetPassword = useResetPassword()

  const [validating, setValidating] = useState(true)
  const [valid, setValid] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

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

    authApi.validateToken(token, 'PASSWORD_RESET').then((result) => {
      setValid(result.valid)
      setValidating(false)
    }).catch(() => {
      setValidating(false)
    })
  }, [token])

  const onSubmit = (data: PasswordForm) => {
    if (!token) return
    resetPassword.mutate({ token, password: data.password })
  }

  if (validating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Loader2 className="mx-auto mb-4 h-16 w-16 animate-spin text-primary" />
            <CardTitle>Validating reset link...</CardTitle>
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
              This password reset link is invalid or has expired.
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Link to="/forgot-password" className="text-primary hover:underline text-sm">
              Request a new reset link
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
            <Logo className="h-10 w-auto" />
          </div>
          <CardTitle>Set a new password</CardTitle>
          <CardDescription>
            Choose a strong password for your account
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  {...register('password')}
                  error={errors.password?.message}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-4 text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
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
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  {...register('confirmPassword')}
                  error={errors.confirmPassword?.message}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(v => !v)}
                  className="absolute right-3 top-4 text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" isLoading={resetPassword.isPending}>
              Reset Password
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
