import { useState } from 'react'
import { useForm, UseFormReturn } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { Button, Input, Label, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui'
import { useRegister, useMagicLinkRegister } from '@/hooks'
import { posthog } from '@/lib/posthog'

const GOOGLE_AUTH_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api/v1/auth/google`
  : '/api/v1/auth/google'

function GoogleButton() {
  return (
    <>
      <a href={GOOGLE_AUTH_URL} className="w-full">
        <Button type="button" variant="outline" className="w-full gap-2">
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Continue with Google
        </Button>
      </a>
      <div className="relative w-full">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-muted-foreground">or</span>
        </div>
      </div>
    </>
  )
}

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

const magicLinkSchema = registerSchema.omit({ password: true })
type MagicLinkForm = z.infer<typeof magicLinkSchema>

export function RegisterPage() {
  const registerMutation = useRegister()
  const magicLinkMutation = useMagicLinkRegister()
  const [showPassword, setShowPassword] = useState(false)
  const [useMagicLink, setUseMagicLink] = useState(true)
  const hasTrackedStart = useState(false)

  const passwordForm = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    mode: 'onBlur',
  })

  const magicLinkForm = useForm<MagicLinkForm>({
    resolver: zodResolver(magicLinkSchema),
    mode: 'onBlur',
  })

  const trackStart = () => {
    if (!hasTrackedStart[0]) {
      hasTrackedStart[1](true)
      posthog.capture('register_form_started', { method: useMagicLink ? 'magic_link' : 'password' })
    }
  }

  const trackFieldError = (field: string, error?: string) => {
    if (error) {
      posthog.capture('register_form_field_error', { field, error })
    }
  }

  const sharedFields = (
    form: UseFormReturn<any>,
    errors: Record<string, any>,
  ) => (
    <>
      <div className="space-y-2">
        <Label htmlFor="organizationName" required>Organization Name</Label>
        <Input
          id="organizationName"
          placeholder="CleanTex"
          {...form.register('organizationName', {
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
            {...form.register('firstName', {
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
            {...form.register('lastName', {
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
          {...form.register('email', {
            onBlur: () => trackFieldError('email', errors.email?.message),
          })}
          onFocus={trackStart}
          error={errors.email?.message}
        />
      </div>
    </>
  )

  if (useMagicLink) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mb-4">
              <span className="text-3xl font-bold text-primary">Kulode</span>
            </div>
            <CardTitle>Create your free account</CardTitle>
            <CardDescription>We'll send you a link to activate your account — no password needed</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <GoogleButton />
          </CardContent>
          <form onSubmit={magicLinkForm.handleSubmit((data) => magicLinkMutation.mutate(data))}>
            <CardContent className="space-y-4">
              {sharedFields(magicLinkForm, magicLinkForm.formState.errors)}
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" className="w-full" isLoading={magicLinkMutation.isPending}>
                Send activation link
              </Button>
              <button
                type="button"
                onClick={() => setUseMagicLink(false)}
                className="text-center text-sm text-muted-foreground hover:text-foreground"
              >
                Prefer to sign up with a password instead
              </button>
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mb-4">
            <span className="text-3xl font-bold text-primary">Kulode</span>
          </div>
          <CardTitle>Create your free account</CardTitle>
          <CardDescription>Start managing your business finances</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <GoogleButton />
        </CardContent>
        <form onSubmit={passwordForm.handleSubmit((data) => registerMutation.mutate(data))}>
          <CardContent className="space-y-4">
            {sharedFields(passwordForm, passwordForm.formState.errors)}
            <div className="space-y-2">
              <Label htmlFor="password" required>Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  {...passwordForm.register('password', {
                    onBlur: () => trackFieldError('password', passwordForm.formState.errors.password?.message),
                  })}
                  onFocus={trackStart}
                  error={passwordForm.formState.errors.password?.message}
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
              {!passwordForm.formState.errors.password && (
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
            <button
              type="button"
              onClick={() => setUseMagicLink(true)}
              className="text-center text-sm text-muted-foreground hover:text-foreground"
            >
              Sign up with email link instead
            </button>
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
