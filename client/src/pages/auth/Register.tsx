import { useState, useRef, useEffect } from 'react'
import { useForm, UseFormReturn } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link } from 'react-router-dom'
import { Eye, EyeOff, Mail, MessageCircle, Pointer, ArrowLeft, Check } from 'lucide-react'
import {
  Button,
  Input,
  Label,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui'
import { Logo } from '@/components/shared'
import { useRegister, useMagicLinkRegister } from '@/hooks'
import { posthog } from '@/lib/posthog'

const PASSWORD_RULES = [
  { label: 'At least 8 characters', test: (v: string) => v.length >= 8 },
  { label: 'One uppercase letter', test: (v: string) => /[A-Z]/.test(v) },
  { label: 'One number or special character', test: (v: string) => /[\d\W]/.test(v) },
]

const GOOGLE_AUTH_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api/v1/auth/google`
  : '/api/v1/auth/google'

const LANDING_URL = import.meta.env.DEV
  ? `http://${window.location.hostname}:4321`
  : 'https://tarione.com'

const registerSchema = z.object({
  organizationName: z.string().min(2, 'Organization name is required'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain an uppercase letter')
    .regex(/[\d\W]/, 'Must contain a number or special character'),
})

type RegisterForm = z.infer<typeof registerSchema>

const magicLinkSchema = registerSchema.omit({ password: true })
type MagicLinkForm = z.infer<typeof magicLinkSchema>

function LeftPanel() {
  return (
    <div className="hidden lg:flex lg:col-span-7 flex-col justify-between p-16 text-white relative overflow-hidden bg-[#00247d] bg-gradient-to-br from-[#001c66] via-[#00247d] to-[#0037b0] border-r border-white/5">
      {/* Floating decorative circles */}
      <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-blue-600/10 blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] rounded-full bg-indigo-500/10 blur-[100px] pointer-events-none"></div>
      
      {/* Logo */}
      <div className="relative z-10 flex items-center gap-3">
        <a href={LANDING_URL} className="hover:opacity-90 transition-opacity">
          <Logo variant="inverted" className="h-14 w-auto" />
        </a>
      </div>
      
      {/* Center Content & Animated Mockups */}
      <div className="relative z-10 my-auto py-6 grid grid-cols-1 xl:grid-cols-12 gap-8 items-center">
        <div className="xl:col-span-6 space-y-6">
          <h1 className="text-4xl xl:text-5xl font-semibold leading-[1.1] tracking-[-0.02em] text-white">
            Nigeria's modern invoicing & <span className="bg-gradient-to-r from-blue-300 via-indigo-200 to-white bg-clip-text text-transparent">compliance engine</span>
          </h1>
          <p className="text-base text-blue-100/80 leading-relaxed max-w-lg">
            Automate your billing, track expenses under tax categories, and auto-generate e-filing summaries compliant with FIRS & NFIU.
          </p>
        </div>
        
        {/* Animated illustration container */}
        <div className="xl:col-span-6 relative flex justify-center items-center py-6 scale-90 xl:scale-100">
          {/* Background decorative pulse circle */}
          <div className="absolute w-[300px] h-[300px] rounded-full bg-white/5 blur-3xl -z-10 animate-pulse"></div>

          {/* Cutout Image Card of Person Looking at Phone */}
          <div className="relative w-[240px] h-[320px] rounded-[32px] overflow-visible flex items-center justify-center border border-white/10 shadow-2xl bg-white p-2">
            <img src="/person_looking_at_phone.png" alt="Person looking at phone" className="w-full h-full object-cover rounded-[24px] filter" />
            
            {/* Animation overlays */}
            
            {/* Email flying card */}
            <div className="absolute -top-6 -left-10 glass-card p-3 rounded-[20px] shadow-lg border border-white/20 max-w-[170px] flex items-center gap-3 animate-float-email text-slate-800">
              <div className="w-8 h-8 rounded-full bg-[#0037b0] flex items-center justify-center text-white shrink-0">
                <Mail size={14} className="text-white" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-900 leading-tight">Invoice Sent</p>
                <p className="text-[8px] text-slate-500 leading-tight">via email ✉️</p>
              </div>
            </div>

            {/* WhatsApp Chat bubble */}
            <div className="absolute top-[35%] -right-12 bg-[#d9fdd3] p-3 rounded-[20px] rounded-tr-none shadow-md border border-[#c2f0b7] max-w-[190px] flex items-start gap-2.5 animate-slide-whatsapp text-slate-800">
              <div className="w-6 h-6 rounded-full bg-[#25d366] flex items-center justify-center text-white shrink-0 mt-0.5">
                <MessageCircle size={12} className="text-white fill-white" />
              </div>
              <div>
                <p className="text-[8px] text-[#128c7e] font-bold">Tari1 Notification</p>
                <p className="text-[9px] text-slate-800 leading-snug mt-0.5">Pay instantly at <span className="text-blue-600 underline">pay.tarione.com/inv-001</span></p>
              </div>
            </div>

            {/* Clicking to pay animation bubble */}
            <div className="absolute -bottom-6 -left-6 bg-white p-3.5 rounded-[24px] shadow-2xl border border-slate-100 max-w-[190px] animate-pay-flow text-slate-800">
              <div className="text-center">
                <p className="text-[9px] text-slate-400">Amount Due</p>
                <p className="text-xs font-extrabold text-[#0037b0] mb-1.5 tabular-nums">₦150,000.00</p>
                <div className="relative inline-block w-full">
                  <div className="w-full text-white text-[9px] font-bold py-2 rounded-lg flex items-center justify-center gap-1.5 shadow-md shadow-blue-500/20 relative animate-btn-pay select-none min-h-[28px]">
                    <span className="pay-text-paynow absolute inset-0 flex items-center justify-center animate-text-paynow">PAY NOW</span>
                    <span className="pay-text-paid absolute inset-0 flex items-center justify-center animate-text-paid opacity-0 text-[#006c49] bg-emerald-50 font-extrabold rounded-lg">PAID ✓</span>
                  </div>
                  {/* Hand clicking cursor */}
                  <div className="absolute right-2 bottom-[-12px] w-5 h-5 text-[#0037b0] animate-cursor-click pointer-events-none">
                    <Pointer size={18} className="rotate-90 fill-[#0037b0]" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="relative z-10 flex justify-between items-center text-xs text-blue-200/50">
        <p>© {new Date().getFullYear()} Tari1. All rights reserved. <span className="font-mono opacity-80 text-[10px] bg-white/10 text-white px-1.5 py-0.5 rounded ml-1">v{__APP_VERSION__}</span></p>
        <a href="/privacy" className="hover:text-white transition-colors">Privacy & Terms</a>
      </div>
    </div>
  )
}

function GoogleButton() {
  return (
    <>
      <div className="relative w-full">
        {/* Recommended micro-badge */}
        <div className="absolute -top-2.5 right-4 z-10 bg-[#eef4ff] text-[#0037b0] border border-[#0037b0]/25 text-[10px] font-semibold px-2.5 py-0.5 rounded-full tracking-wide shadow-sm select-none">
          recommended
        </div>
        <a href={GOOGLE_AUTH_URL} className="w-full block" onClick={() => posthog.capture('google_oauth_initiated', { page: 'register' })}>
          <Button type="button" variant="outline" className="w-full gap-3 py-6 rounded-2xl border-slate-200/80 hover:bg-slate-50 text-slate-700 font-bold active:scale-98 transition-all duration-200 shadow-[0_8px_24px_rgba(0,55,176,0.05)] hover:shadow-[0_8px_24px_rgba(0,55,176,0.12)] hover:border-[#0037b0]/30">
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continue with Google
          </Button>
        </a>
      </div>
      <div className="relative w-full py-2">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-slate-200/60" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-white px-3 text-slate-400 font-bold tracking-wider">or sign up with email</span>
        </div>
      </div>
    </>
  )
}

function SharedFields({
  form,
  errors,
  onFocus,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errors: Record<string, any>
  onFocus: () => void
}) {
  const trackFieldError = (field: string, error?: string) => {
    if (error) posthog.capture('register_form_field_error', { field, error })
  }

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="organizationName" className="text-xs font-bold uppercase tracking-wider text-slate-500" required>
          Organization Name
        </Label>
        <Input
          id="organizationName"
          placeholder="CleanTex"
          className="rounded-2xl border-slate-200/80 focus:border-[#0037b0] focus:ring-2 focus:ring-[#0037b0]/10 py-5"
          {...form.register('organizationName', {
            onBlur: () => trackFieldError('organizationName', errors.organizationName?.message),
          })}
          onFocus={onFocus}
          error={errors.organizationName?.message}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="firstName" className="text-xs font-bold uppercase tracking-wider text-slate-500" required>
            First Name
          </Label>
          <Input
            id="firstName"
            placeholder="Amina"
            className="rounded-2xl border-slate-200/80 focus:border-[#0037b0] focus:ring-2 focus:ring-[#0037b0]/10 py-5"
            {...form.register('firstName', {
              onBlur: () => trackFieldError('firstName', errors.firstName?.message),
            })}
            onFocus={onFocus}
            error={errors.firstName?.message}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName" className="text-xs font-bold uppercase tracking-wider text-slate-500" required>
            Last Name
          </Label>
          <Input
            id="lastName"
            placeholder="Adebayo"
            className="rounded-2xl border-slate-200/80 focus:border-[#0037b0] focus:ring-2 focus:ring-[#0037b0]/10 py-5"
            {...form.register('lastName', {
              onBlur: () => trackFieldError('lastName', errors.lastName?.message),
            })}
            onFocus={onFocus}
            error={errors.lastName?.message}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="email" className="text-xs font-bold uppercase tracking-wider text-slate-500" required>
          Email Address
        </Label>
        <Input
          id="email"
          type="email"
          placeholder="amina@cleantex.com"
          className="rounded-2xl border-slate-200/80 focus:border-[#0037b0] focus:ring-2 focus:ring-[#0037b0]/10 py-5"
          {...form.register('email', {
            onBlur: () => trackFieldError('email', errors.email?.message),
          })}
          onFocus={onFocus}
          error={errors.email?.message}
        />
      </div>
    </>
  )
}

export function RegisterPage() {
  const registerMutation = useRegister()
  const magicLinkMutation = useMagicLinkRegister()
  const [showPassword, setShowPassword] = useState(false)
  const [useMagicLink, setUseMagicLink] = useState(true)
  const hasTrackedStart = useState(false)
  const mountedAt = useRef(0)

  useEffect(() => {
    mountedAt.current = Date.now()
  }, [])

  const passwordForm = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    mode: 'onBlur',
  })

  const passwordValue = passwordForm.watch('password', '')

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

  const handleMagicLinkSubmit = (data: MagicLinkForm) => {
     
    if (Date.now() - mountedAt.current < 1500) return
    magicLinkMutation.mutate(data)
  }

  const handlePasswordSubmit = (data: RegisterForm) => {
     
    if (Date.now() - mountedAt.current < 1500) return
    registerMutation.mutate(data)
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-12 bg-[#faf8ff] font-sans antialiased">
      <LeftPanel />

      {/* Right Form Panel */}
      <div className="flex flex-col items-center justify-center p-6 md:p-12 lg:col-span-5 bg-background">
        {/* Back navigation — lives ABOVE the card, not inside it */}
        <div className="w-full max-w-md mb-4">
          <a
            href={LANDING_URL}
            className="inline-flex items-center gap-2 min-h-[44px] px-1 text-sm font-semibold text-slate-500 hover:text-[#00247d] transition-all duration-200 group cursor-pointer"
          >
            <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-white border border-slate-200/80 shadow-sm group-hover:shadow-md group-hover:border-[#0037b0]/20 transition-all duration-200">
              <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform duration-200" />
            </span>
            <span>Back to website</span>
          </a>
        </div>

        <Card className="w-full max-w-md border border-slate-200/60 shadow-[0_20px_50px_rgba(0,55,176,0.06)] bg-white rounded-[32px] p-2">
          <CardHeader className="text-center pb-4 pt-6">
            <div className="mb-4 lg:hidden flex justify-center">
              <a href={LANDING_URL} className="hover:opacity-90 transition-opacity">
                <Logo className="h-12 w-auto" />
              </a>
            </div>
            <CardTitle className="text-2xl font-semibold text-slate-900 tracking-tight">Create your account</CardTitle>
            <CardDescription className="text-xs text-slate-500 mt-1">Professional invoicing, payments, and compliance for Nigerian small businesses, freelancers, and DNFBPs.</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <GoogleButton />
          </CardContent>

          <CardContent className="pt-0">
            {useMagicLink ? (
              <form
                onSubmit={magicLinkForm.handleSubmit(handleMagicLinkSubmit)}
                className="space-y-4"
              >
                <SharedFields
                  form={magicLinkForm}
                  errors={magicLinkForm.formState.errors}
                  onFocus={trackStart}
                />
                <Button type="submit" className="w-full py-6 rounded-2xl text-sm font-bold shadow-lg shadow-[#0037b0]/20 active:scale-98 transition-all btn-gradient" isLoading={magicLinkMutation.isPending}>
                  Send activation link
                </Button>
                <button
                  type="button"
                  onClick={() => setUseMagicLink(false)}
                  className="w-full text-center text-xs text-[#0037b0] hover:underline font-extrabold"
                >
                  Prefer to sign up with a password instead
                </button>
              </form>
            ) : (
              <form
                onSubmit={passwordForm.handleSubmit(handlePasswordSubmit)}
                className="space-y-4"
              >
                <SharedFields
                  form={passwordForm}
                  errors={passwordForm.formState.errors}
                  onFocus={trackStart}
                />
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-xs font-bold uppercase tracking-wider text-slate-500" required>
                    Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      className="rounded-2xl border-slate-200/80 focus:border-[#0037b0] focus:ring-2 focus:ring-[#0037b0]/10 py-5"
                      {...passwordForm.register('password', {
                        onBlur: () => {
                          if (passwordForm.formState.errors.password?.message) {
                            posthog.capture('register_form_field_error', {
                              field: 'password',
                              error: passwordForm.formState.errors.password.message,
                            })
                          }
                        },
                      })}
                      onFocus={trackStart}
                      error={passwordForm.formState.errors.password?.message}
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
                  <ul className="space-y-1 pt-1 text-left">
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
                <Button type="submit" className="w-full py-6 rounded-2xl text-sm font-bold shadow-lg shadow-[#0037b0]/20 active:scale-98 transition-all btn-gradient" isLoading={registerMutation.isPending}>
                  Create account
                </Button>
                <button
                  type="button"
                  onClick={() => setUseMagicLink(true)}
                  className="w-full text-center text-xs text-[#0037b0] hover:underline font-extrabold"
                >
                  Sign up with email link instead
                </button>
              </form>
            )}
          </CardContent>

          <CardFooter className="pb-6 pt-2">
            <p className="text-center text-xs text-slate-500 w-full">
              Already have an account?{' '}
              <Link to="/login" className="text-[#0037b0] hover:underline font-extrabold">
                Sign in
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
