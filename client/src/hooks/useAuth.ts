import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { authApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { posthog } from '@/lib/posthog'
import { getPostAuthRoute as postAuthRoute } from '@/lib/authRouting'
import type { LoginCredentials, RegisterData } from '@/types'

declare function gtag(...args: unknown[]): void

export function useLogin() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((state) => state.setAuth)

  return useMutation({
    mutationFn: (credentials: LoginCredentials) => authApi.login(credentials),
    onSuccess: (data) => {
      setAuth(data.user, data.accessToken)
      posthog.capture('user_logged_in', { method: 'password' })
      toast.success('Welcome back!', {
        description: `Logged in as ${data.user.firstName}`,
      })
      navigate(postAuthRoute(data.user))
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Login failed'
      toast.error('Login failed', { description: message })
    },
  })
}

export function useRegister() {
  const navigate = useNavigate()

  return useMutation({
    mutationFn: (data: RegisterData) => authApi.register(data),
    onSuccess: (data) => {
      posthog.capture('organization_created')
      gtag('event', 'conversion', { send_to: 'AW-18047051668/pYdJCPn0uKscEJTPwJ1D' })
      navigate('/check-email', { state: { email: data.email } })
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Registration failed'
      toast.error('Registration failed', { description: message })
    },
  })
}

export function useVerifyEmail() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((state) => state.setAuth)

  return useMutation({
    mutationFn: (token: string) => authApi.verifyEmail(token),
    onSuccess: (data: any) => {
      setAuth(data.user, data.accessToken)
      posthog.capture('email_verified')
      if (data.needsPasswordSetup && data.setupToken) {
        navigate(`/set-password?token=${data.setupToken}`)
      } else {
        toast.success('Email verified!', { description: 'Welcome to Tari1' })
        navigate(postAuthRoute(data.user))
      }
    },
  })
}

export function useMagicLinkRegister() {
  const navigate = useNavigate()

  return useMutation({
    mutationFn: (data: Omit<import('@/types').RegisterData, 'password'>) =>
      authApi.registerMagicLink(data),
    onSuccess: (data) => {
      posthog.capture('organization_created', { method: 'magic_link' })
      gtag('event', 'conversion', { send_to: 'AW-18047051668/pYdJCPn0uKscEJTPwJ1D' })
      navigate('/check-email', { state: { email: data.email } })
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Registration failed'
      toast.error('Registration failed', { description: message })
    },
  })
}

export function useSetPassword() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((state) => state.setAuth)

  return useMutation({
    mutationFn: ({ token, password }: { token: string; password: string }) =>
      authApi.setPassword(token, password),
    onSuccess: (data) => {
      setAuth(data.user, data.accessToken)
      toast.success('Password set!', {
        description: 'Your account is now active',
      })
      navigate(postAuthRoute(data.user))
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to set password'
      toast.error('Error', { description: message })
    },
  })
}

export function useResendVerification() {
  return useMutation({
    mutationFn: (email: string) => authApi.resendVerification(email),
    onSuccess: () => {
      toast.success('Verification email sent', {
        description: 'Please check your inbox',
      })
    },
    onError: () => {
      toast.error('Failed to resend verification email')
    },
  })
}

export function useForgotPassword() {
  const navigate = useNavigate()

  return useMutation({
    mutationFn: (email: string) => authApi.forgotPassword(email),
    onSuccess: (_data, email) => {
      posthog.capture('password_reset_requested')
      navigate('/check-email', { state: { variant: 'reset', email } })
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to send reset email'
      toast.error('Error', { description: message })
    },
  })
}

export function useResetPassword() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((state) => state.setAuth)

  return useMutation({
    mutationFn: ({ token, password }: { token: string; password: string }) =>
      authApi.resetPassword(token, password),
    onSuccess: (data) => {
      setAuth(data.user, data.accessToken)
      posthog.capture('password_reset_completed')
      toast.success('Password reset!', {
        description: 'You are now logged in',
      })
      navigate(postAuthRoute(data.user))
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to reset password'
      toast.error('Error', { description: message })
    },
  })
}

export function useLogout() {
  const navigate = useNavigate()
  const logout = useAuthStore((state) => state.logout)

  return () => {
    posthog.capture('user_logged_out')
    logout()
    toast.success('Logged out')
    navigate('/login')
  }
}

// For PIN-eligible roles on a shared terminal — hands off to the PIN pad instead of the full
// email/password login screen. Deliberately does NOT clear the session here: /pin isn't under
// ProtectedRoute, so navigating first (while still "authenticated") leaves cleanly with no
// intermediate render where ProtectedRoute could fire its own redirect to /login. PinLoginPage
// clears the outgoing session itself once mounted — see its own effect.
export function useSwitchUser() {
  const navigate = useNavigate()

  return () => {
    posthog.capture('user_switched')
    navigate('/pin')
  }
}
