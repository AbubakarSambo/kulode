import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { authApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { posthog } from '@/lib/posthog'
import type { LoginCredentials, RegisterData } from '@/types'

export function useLogin() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((state) => state.setAuth)

  return useMutation({
    mutationFn: (credentials: LoginCredentials) => authApi.login(credentials),
    onSuccess: (data) => {
      setAuth(data.user, data.accessToken)
      posthog.capture('user_logged_in')
      toast.success('Welcome back!', {
        description: `Logged in as ${data.user.firstName}`,
      })
      navigate('/dashboard')
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
    onSuccess: (data) => {
      setAuth(data.user, data.accessToken)
      toast.success('Email verified!', {
        description: 'Welcome to Kulode',
      })
      navigate('/dashboard')
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
      navigate('/dashboard')
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
      toast.success('Password reset!', {
        description: 'You are now logged in',
      })
      navigate('/dashboard')
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
    logout()
    toast.success('Logged out')
    navigate('/login')
  }
}
