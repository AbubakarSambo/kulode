import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { Button, Input, Label, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui'
import { useRegister } from '@/hooks'
import { posthog } from '@/lib/posthog'

const registerSchema = z.object({
  organizationName: z.string().min(2, 'Organization name is required'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(
      /((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/,
      'Password must contain uppercase, lowercase, and a number or special character'
    ),
})

type RegisterForm = z.infer<typeof registerSchema>

export function RegisterPage() {
  const registerMutation = useRegister()
  const [showPassword, setShowPassword] = useState(false)
  const hasTrackedStart = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    mode: 'onBlur',
  })

  const trackStart = () => {
    if (!hasTrackedStart[0]) {
      hasTrackedStart[1](true)
      posthog.capture('register_form_started')
    }
  }

  const trackFieldError = (field: string, error?: string) => {
    if (error) {
      posthog.capture('register_form_field_error', { field, error })
    }
  }

  const onSubmit = (data: RegisterForm) => {
    registerMutation.mutate(data)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mb-4">
            <span className="text-3xl font-bold text-primary">Kulode</span>
          </div>
          <CardTitle>Create your account</CardTitle>
          <CardDescription>Start managing your business finances</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="organizationName" required>Organization Name</Label>
              <Input
                id="organizationName"
                placeholder="CleanTex"
                {...register('organizationName', {
                  onBlur: () => trackFieldError('organizationName', errors.organizationName?.message),
                })}
                onFocus={trackStart}
                error={errors.organizationName?.message}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName" required>First Name</Label>
                <Input
                  id="firstName"
                  placeholder="Amina"
                  {...register('firstName', {
                    onBlur: () => trackFieldError('firstName', errors.firstName?.message),
                  })}
                  onFocus={trackStart}
                  error={errors.firstName?.message}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName" required>Last Name</Label>
                <Input
                  id="lastName"
                  placeholder="Adebayo"
                  {...register('lastName', {
                    onBlur: () => trackFieldError('lastName', errors.lastName?.message),
                  })}
                  onFocus={trackStart}
                  error={errors.lastName?.message}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" required>Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="amina@cleantex.com"
                {...register('email', {
                  onBlur: () => trackFieldError('email', errors.email?.message),
                })}
                onFocus={trackStart}
                error={errors.email?.message}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" required>Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  {...register('password', {
                    onBlur: () => trackFieldError('password', errors.password?.message),
                  })}
                  onFocus={trackStart}
                  error={errors.password?.message}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-2 top-1.5 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {!errors.password && (
                <p className="text-xs text-muted-foreground">
                  Min 8 characters, with uppercase, lowercase, and a number or symbol.
                </p>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" isLoading={registerMutation.isPending}>
              Create free account
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link to="/login" className="text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
