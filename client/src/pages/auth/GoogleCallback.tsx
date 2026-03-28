import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth'
import { authApi } from '@/api'
import { posthog } from '@/lib/posthog'

export function GoogleCallbackPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const setAuth = useAuthStore((state) => state.setAuth)

  useEffect(() => {
    const token = searchParams.get('token')
    const error = searchParams.get('error')
    const isNewUser = searchParams.get('new') === 'true'

    if (error || !token) {
      toast.error('Google sign-in failed', { description: 'Please try again or use email sign-in.' })
      navigate('/login')
      return
    }

    // Store token in localStorage so the API client can attach it to getProfile
    localStorage.setItem('token', token)

    authApi.getProfile()
      .then((user) => {
        setAuth(user, token)
        if (isNewUser) {
          posthog.capture('organization_created', { method: 'google' })
        }
        posthog.capture('user_logged_in', { method: 'google' })
        toast.success(`Welcome${user.firstName ? `, ${user.firstName}` : ''}!`)
        navigate('/dashboard')
      })
      .catch(() => {
        localStorage.removeItem('token')
        toast.error('Google sign-in failed', { description: 'Please try again.' })
        navigate('/login')
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <p className="text-muted-foreground">Signing you in...</p>
    </div>
  )
}
