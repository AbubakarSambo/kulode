import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth'

// In production, use VITE_API_URL env var; in dev, use proxy
const API_BASE_URL = import.meta.env.VITE_API_URL 
  ? `${import.meta.env.VITE_API_URL}/api/v1`
  : '/api/v1'

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor - attach token
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor - handle errors and version headers
apiClient.interceptors.response.use(
  (response) => {
    const versionHeader = response?.headers?.['x-app-version']
    if (versionHeader) {
      window.dispatchEvent(new CustomEvent('app-version-detected', { detail: versionHeader }))
    }
    return response
  },
  (error: AxiosError<{ message?: string; errors?: Record<string, string[]> }>) => {
    const versionHeader = error.response?.headers?.['x-app-version']
    if (versionHeader) {
      window.dispatchEvent(new CustomEvent('app-version-detected', { detail: versionHeader }))
    }
    const message = error.response?.data?.message || 'An error occurred'
    
    if (error.response?.status === 401) {
      const url = error.config?.url || ''
      const authEndpoints = ['/auth/login', '/auth/verify-email', '/auth/set-password', '/auth/resend-verification', '/auth/pin-login']
      const isAuthEndpoint = authEndpoints.some(ep => url.includes(ep))
      // If there's no token at all, we already know we're logged out — most likely a deliberate
      // "Switch User"/"Logout" that cleared the session right before this stale in-flight request
      // landed. The app's own routing (ProtectedRoute/GuestRoute) already handles that case via a
      // normal SPA navigation; forcing a hard `window.location.href` reload here would stomp over
      // wherever that navigation was actually headed (e.g. /pin). Only a *surprise* mid-session
      // expiry — token still present but rejected — should force the hard redirect.
      const hasToken = !!localStorage.getItem('token')
      if (hasToken && !isAuthEndpoint) {
        useAuthStore.getState().logout()
        window.location.href = '/login'
      }
      return Promise.reject(error)
    }

    if (error.response?.status === 403) {
      const errorData = error.response.data as { code?: string; message?: string }
      if (errorData?.code === 'SUBSCRIPTION_EXPIRED_READ_ONLY' || errorData?.message?.includes('subscription has expired')) {
        toast.error('Subscription Expired', {
          description: 'Your account is in read-only mode. Please renew your subscription to perform this action.',
        })
      } else {
        toast.error('Access denied', {
          description: 'You do not have permission to perform this action',
        })
      }
    } else if (error.response?.status === 404) {
      toast.error('Not found', {
        description: message,
      })
    } else if (error.response?.status === 422 || error.response?.status === 400) {
      // Validation errors - let the form handle them
    } else if (error.response?.status && error.response.status >= 500) {
      toast.error('Server error', {
        description: 'Something went wrong. Please try again later.',
      })
    }

    return Promise.reject(error)
  }
)

export default apiClient
