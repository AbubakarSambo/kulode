import { useState } from 'react'
import { useForm, UseFormReturn } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link } from 'react-router-dom'
import { Eye, EyeOff, Zap, MessageCircle, BarChart3, Receipt } from 'lucide-react'
import { Button, Input, Label } from '@/components/ui'
import { useRegister, useMagicLinkRegister } from '@/hooks'
import { posthog } from '@/lib/posthog'

const GOOGLE_AUTH_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api/v1/auth/google`
  : '/api/v1/auth/google'

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
  _hp: z.string().optional(),
})

type RegisterForm = z.infer<typeof registerSchema>

const magicLinkSchema = registerSchema.omit({ password: true })
type MagicLinkForm = z.infer<typeof magicLinkSchema>

function InvoiceMockup() {
  return (
    <div className="rounded-xl overflow-hidden shadow-lg border border-primary-200/50 bg-white">
      <div className="bg-primary-900 px-5 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="text-white/60 text-[10px] font-semibold tracking-widest uppercase">Invoice</div>
          <div className="flex gap-1.5">
            <div className="w-2 h-2 rounded-full bg-white/20" />
            <div className="w-2 h-2 rounded-full bg-white/20" />
            <div className="w-2 h-2 rounded-full bg-white/20" />
          </div>
        </div>
        <div className="text-white font-bold text-sm mb-1">CleanTex Services</div>
        <div className="flex justify-between items-end">
          <div className="text-white/50 text-[10px]">INV-2024-001</div>
          <div className="text-success font-bold text-sm">₦ 185,000</div>
        </div>
      </div>
      <div className="bg-white px-5 py-3">
        <div className="flex text-[9px] font-semibold text-muted-foreground uppercase mb-2 border-b pb-1.5">
          <span className="flex-1">Description</span>
          <span className="w-14 text-right">Qty</span>
          <span className="w-20 text-right">Amount</span>
        </div>
        {[
          { desc: 'Deep cleaning (office)', qty: 2, amount: '₦ 60,000' },
          { desc: 'Monthly maintenance', qty: 1, amount: '₦ 85,000' },
          { desc: 'Supply materials', qty: 1, amount: '₦ 40,000' },
        ].map((row, i) => (
          <div key={i} className="flex text-[9px] py-1 border-b border-border/50 last:border-0">
            <span className="flex-1 text-muted-foreground">{row.desc}</span>
            <span className="w-14 text-right text-muted-foreground">{row.qty}</span>
            <span className="w-20 text-right font-medium text-foreground">{row.amount}</span>
          </div>
        ))}
        <div className="flex justify-between mt-2 pt-2 text-[9px] font-bold border-t">
          <span>Total</span>
          <span className="text-primary">₦ 185,000</span>
        </div>
      </div>
    </div>
  )
}

function LeftPanel() {
  return (
    <div className="hidden lg:flex flex-col w-[52%] bg-primary-50 p-12">
      <div>
        <p className="text-primary font-bold text-sm mb-8">Kulode</p>
        <h1 className="text-[2.5rem] font-extrabold text-foreground leading-tight mb-8">
          Send invoices.<br />
          <span className="text-primary">Get paid faster.</span>
        </h1>
        <div className="space-y-5">
          <div className="flex gap-4 items-start">
            <div className="w-9 h-9 rounded-full bg-success/15 flex items-center justify-center shrink-0 mt-0.5">
              <Zap size={15} className="text-success" />
            </div>
            <div>
              <p className="font-semibold text-foreground text-sm">Create in 60s</p>
              <p className="text-sm text-muted-foreground">Professional templates ready to go in seconds.</p>
            </div>
          </div>
          <div className="flex gap-4 items-start">
            <div className="w-9 h-9 rounded-full bg-success/15 flex items-center justify-center shrink-0 mt-0.5">
              <MessageCircle size={15} className="text-success" />
            </div>
            <div>
              <p className="font-semibold text-foreground text-sm">Share via WhatsApp</p>
              <p className="text-sm text-muted-foreground">Meet your clients where they already are.</p>
            </div>
          </div>
          <div className="flex gap-4 items-start">
            <div className="w-9 h-9 rounded-full bg-success/15 flex items-center justify-center shrink-0 mt-0.5">
              <BarChart3 size={15} className="text-success" />
            </div>
            <div>
              <p className="font-semibold text-foreground text-sm">Track payments automatically</p>
              <p className="text-sm text-muted-foreground">Real-time alerts when your money hits the bank.</p>
            </div>
          </div>
          <div className="flex gap-4 items-start">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <Receipt size={15} className="text-primary" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-foreground text-sm">Tax filing, sorted</p>
                <span className="text-[10px] font-bold uppercase tracking-wide bg-primary text-primary-foreground px-1.5 py-0.5 rounded">New</span>
              </div>
              <p className="text-sm text-muted-foreground">Export FIRS-ready tax reports in one click.</p>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-10">
        <InvoiceMockup />
      </div>
    </div>
  )
}

function GoogleButton() {
  return (
    <>
      <a href={GOOGLE_AUTH_URL} className="block">
        <Button type="button" variant="outline" className="w-full gap-2 h-11">
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Continue with Google
        </Button>
      </a>
      <div className="relative py-1">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-[10px] uppercase tracking-widest">
          <span className="bg-white px-3 text-muted-foreground">or sign up with email</span>
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
  form: UseFormReturn<any>
  errors: Record<string, any>
  onFocus: () => void
}) {
  const trackFieldError = (field: string, error?: string) => {
    if (error) posthog.capture('register_form_field_error', { field, error })
  }

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="organizationName" className="text-[10px] font-bold uppercase tracking-widest" required>
          Organization Name
        </Label>
        <Input
          id="organizationName"
          placeholder="CleanTex"
          {...form.register('organizationName', {
            onBlur: () => trackFieldError('organizationName', errors.organizationName?.message),
          })}
          onFocus={onFocus}
          error={errors.organizationName?.message}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="firstName" className="text-[10px] font-bold uppercase tracking-widest" required>
            First Name
          </Label>
          <Input
            id="firstName"
            placeholder="Amina"
            {...form.register('firstName', {
              onBlur: () => trackFieldError('firstName', errors.firstName?.message),
            })}
            onFocus={onFocus}
            error={errors.firstName?.message}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lastName" className="text-[10px] font-bold uppercase tracking-widest" required>
            Last Name
          </Label>
          <Input
            id="lastName"
            placeholder="Adebayo"
            {...form.register('lastName', {
              onBlur: () => trackFieldError('lastName', errors.lastName?.message),
            })}
            onFocus={onFocus}
            error={errors.lastName?.message}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email" className="text-[10px] font-bold uppercase tracking-widest" required>
          Email Address
        </Label>
        <Input
          id="email"
          type="email"
          placeholder="amina@cleantex.com"
          {...form.register('email', {
            onBlur: () => trackFieldError('email', errors.email?.message),
          })}
          onFocus={onFocus}
          error={errors.email?.message}
        />
      </div>
      <input {...form.register('_hp')} type="hidden" />
    </>
  )
}

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

  return (
    <div
      className="min-h-screen bg-foreground flex items-center justify-center p-4 lg:p-8"
      style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)', backgroundSize: '24px 24px' }}
    >
      <div className="w-full max-w-5xl bg-white rounded-2xl overflow-hidden shadow-2xl flex">
        <LeftPanel />

        {/* Right panel */}
        <div className="flex-1 flex flex-col justify-center px-10 py-10 lg:px-14 overflow-y-auto">
          {/* Mobile header — condensed value prop, no bullets or mockup */}
          <div className="lg:hidden mb-8 pb-8 border-b">
            <p className="text-primary font-bold text-sm mb-3">Kulode</p>
            <h1 className="text-2xl font-extrabold text-foreground leading-snug mb-3">
              Send invoices.<br />
              <span className="text-primary">Get paid faster.</span>
            </h1>
            <div className="inline-flex items-center gap-1.5 bg-primary-50 rounded-full px-3 py-1.5">
              <Receipt size={13} className="text-primary shrink-0" />
              <span className="text-xs text-primary font-medium">
                <span className="font-bold">New:</span> Export FIRS-ready tax reports in one click
              </span>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-foreground mb-1">Create your free account</h2>
          <p className="text-muted-foreground text-sm mb-7">Start professionalizing your freelance business today.</p>

          <div className="space-y-4">
            <GoogleButton />

            {useMagicLink ? (
              <form
                onSubmit={magicLinkForm.handleSubmit((data) => magicLinkMutation.mutate(data))}
                className="space-y-4"
              >
                <SharedFields
                  form={magicLinkForm}
                  errors={magicLinkForm.formState.errors}
                  onFocus={trackStart}
                />
                <Button type="submit" className="w-full h-11" isLoading={magicLinkMutation.isPending}>
                  Send activation link
                </Button>
                <button
                  type="button"
                  onClick={() => setUseMagicLink(false)}
                  className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
                >
                  Prefer to sign up with a password instead
                </button>
              </form>
            ) : (
              <form
                onSubmit={passwordForm.handleSubmit((data) => registerMutation.mutate(data))}
                className="space-y-4"
              >
                <SharedFields
                  form={passwordForm}
                  errors={passwordForm.formState.errors}
                  onFocus={trackStart}
                />
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-[10px] font-bold uppercase tracking-widest" required>
                    Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
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
                <Button type="submit" className="w-full h-11" isLoading={registerMutation.isPending}>
                  Create free account
                </Button>
                <button
                  type="button"
                  onClick={() => setUseMagicLink(true)}
                  className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
                >
                  Sign up with email link instead
                </button>
              </form>
            )}

            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link to="/login" className="text-primary hover:underline font-medium">
                Sign in
              </Link>
            </p>
          </div>

        </div>
      </div>
    </div>
  )
}
