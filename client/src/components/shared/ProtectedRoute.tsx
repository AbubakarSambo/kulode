import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import type { UserRole } from '@/types'

interface ProtectedRouteProps {
  allowedRoles?: UserRole[]
}

function AuthLoadingFallback() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  )
}

export function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const location = useLocation()
  const { isAuthenticated, user, _hasHydrated } = useAuthStore()

  useEffect(() => {
    const persistApi = (useAuthStore as any).persist
    const setHydrated = () => useAuthStore.setState({ _hasHydrated: true })
    if (persistApi?.hasHydrated?.()) {
      setHydrated()
      return
    }
    const unsub = persistApi?.onFinishHydration?.(setHydrated)
    const fallback = setTimeout(setHydrated, 100)
    return () => {
      clearTimeout(fallback)
      unsub?.()
    }
  }, [])

  if (!_hasHydrated) {
    return <AuthLoadingFallback />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}

// Redirects authenticated users away from guest-only routes (login, register)
export function GuestRoute() {
  const { isAuthenticated, _hasHydrated } = useAuthStore()

  useEffect(() => {
    const persistApi = (useAuthStore as any).persist
    const setHydrated = () => useAuthStore.setState({ _hasHydrated: true })
    if (persistApi?.hasHydrated?.()) {
      setHydrated()
      return
    }
    const unsub = persistApi?.onFinishHydration?.(setHydrated)
    const fallback = setTimeout(setHydrated, 100)
    return () => {
      clearTimeout(fallback)
      unsub?.()
    }
  }, [])

  if (!_hasHydrated) {
    return <AuthLoadingFallback />
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
