import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Delete } from 'lucide-react'
import { Logo } from '@/components/shared'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui'
import { authApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { getRememberedOrgContext } from '@/lib/deviceOrgContext'
import { getPostAuthRoute } from '@/lib/authRouting'
import { cn } from '@/lib/utils'

const PIN_LENGTH = 4
const KEYPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'] as const

export function PinLoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((state) => state.setAuth)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const logout = useAuthStore((state) => state.logout)
  const [pin, setPin] = useState('')
  const [shake, setShake] = useState(false)
  const orgContext = getRememberedOrgContext()

  // "Switch User" navigates here while still authenticated (see useSwitchUser) so ProtectedRoute
  // never gets a chance to redirect elsewhere first — clear that outgoing session now that we've
  // actually arrived, rather than before navigating.
  useEffect(() => {
    if (isAuthenticated) logout()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pinLogin = useMutation({
    mutationFn: (value: string) => authApi.pinLogin(orgContext!.organizationId, value),
    onSuccess: (data) => {
      setAuth(data.user, data.accessToken)
      navigate(getPostAuthRoute(data.user), { replace: true })
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Invalid PIN')
      setPin('')
      setShake(true)
    },
  })

  useEffect(() => {
    if (pin.length === PIN_LENGTH && orgContext) {
      pinLogin.mutate(pin)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin])

  useEffect(() => {
    if (!shake) return
    const t = setTimeout(() => setShake(false), 400)
    return () => clearTimeout(t)
  }, [shake])

  const press = (key: string) => {
    if (pinLogin.isPending) return
    if (key === 'back') {
      setPin((p) => p.slice(0, -1))
    } else if (key && pin.length < PIN_LENGTH) {
      setPin((p) => p + key)
    }
  }

  if (!orgContext) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#faf8ff] p-6 text-center">
        <Logo className="h-12 w-auto" />
        <p className="max-w-sm text-sm text-slate-500">
          This device hasn't been set up yet — sign in with email and password first to enable quick PIN login.
        </p>
        <Link to="/login" className="font-extrabold text-[#0037b0] hover:underline">
          Go to login
        </Link>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#faf8ff] p-6">
      <Logo className="h-12 w-auto" />
      <Card className="w-full max-w-sm rounded-[32px] border border-slate-200/60 bg-white p-2 shadow-[0_20px_50px_rgba(0,55,176,0.06)]">
        <CardHeader className="pb-2 pt-6 text-center">
          <CardTitle className="text-xl font-black tracking-tight text-slate-900">{orgContext.organizationName}</CardTitle>
          <CardDescription className="text-xs text-slate-500">Enter your PIN</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-6 pb-8">
          <div className={cn('flex gap-3', shake && 'animate-shake')}>
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  'h-4 w-4 rounded-full border-2 border-[#0037b0]/30 transition-colors',
                  i < pin.length && 'border-[#0037b0] bg-[#0037b0]',
                )}
              />
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3">
            {KEYPAD_KEYS.map((key, i) =>
              key === '' ? (
                <div key={i} />
              ) : (
                <button
                  key={i}
                  type="button"
                  onClick={() => press(key)}
                  disabled={pinLogin.isPending}
                  className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-50 text-xl font-bold text-slate-800 transition-colors hover:bg-slate-100 active:scale-95 disabled:opacity-50"
                  aria-label={key === 'back' ? 'Backspace' : key}
                >
                  {key === 'back' ? <Delete className="h-5 w-5" /> : key}
                </button>
              ),
            )}
          </div>

          <Link to="/login" className="text-xs font-semibold text-slate-400 hover:text-[#0037b0] hover:underline">
            Not you? Sign in with email
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
