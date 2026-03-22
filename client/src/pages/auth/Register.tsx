import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { Button, Input, Label, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui'
import { useRegister, useMagicLinkRegister } from '@/hooks'
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
    form: typeof passwordForm | typeof magicLinkForm,
    errors: typeof passwordForm.formState.errors | typeof magicLinkForm.formState.errors,
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
