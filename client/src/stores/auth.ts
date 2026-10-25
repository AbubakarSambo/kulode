import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { posthog } from '@/lib/posthog'
import { queryClient } from '@/lib/queryClient'
import { rememberOrgContext } from '@/lib/deviceOrgContext'
import type { User } from '@/types'

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  _hasHydrated: boolean
  // The platform admin's own session, parked while they're in a "View as" session so Exit (or
  // the 1-hour token expiring) can hand it straight back without a fresh login.
  impersonationOrigin: { user: User; token: string } | null
  setHasHydrated: (hydrated: boolean) => void
  setAuth: (user: User, token: string) => void
  startImpersonation: (user: User, token: string) => void
  endImpersonation: () => User | null
  logout: () => void
  updateUser: (user: Partial<User>) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      _hasHydrated: false,
      impersonationOrigin: null,

      setHasHydrated: (hydrated) => set({ _hasHydrated: hydrated }),

      setAuth: (user, token) => {
        localStorage.setItem('token', token)
        rememberOrgContext(user.organizationId, user.organizationName)
        posthog.identify(user.id, {
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          roles: user.roles,
          organizationId: user.organizationId,
        })
        set({ user, token, isAuthenticated: true })
      },

      // Deliberately skips setAuth's rememberOrgContext/posthog.identify: the device stays tied to
      // the admin's own org (the PIN pad must not start offering the customer's staff), and
      // analytics stay attributed to the admin rather than polluting the customer's org.
      startImpersonation: (user, token) => {
        const { user: originUser, token: originToken, impersonationOrigin } = get()
        // Starting from inside another session keeps the original origin, never the nested one.
        const origin = impersonationOrigin ?? (originUser && originToken ? { user: originUser, token: originToken } : null)
        localStorage.setItem('token', token)
        queryClient.clear()
        set({ user, token, isAuthenticated: true, impersonationOrigin: origin })
      },

      endImpersonation: () => {
        const origin = get().impersonationOrigin
        queryClient.clear()
        if (!origin) {
          localStorage.removeItem('token')
          set({ user: null, token: null, isAuthenticated: false, impersonationOrigin: null })
          return null
        }
        localStorage.setItem('token', origin.token)
        set({ user: origin.user, token: origin.token, isAuthenticated: true, impersonationOrigin: null })
        return origin.user
      },

      logout: () => {
        localStorage.removeItem('token')
        posthog.reset()
        queryClient.clear()
        set({ user: null, token: null, isAuthenticated: false, impersonationOrigin: null })
      },

      updateUser: (userData) => {
        set((state) => ({
          user: state.user ? { ...state.user, ...userData } : null,
        }))
      },
    }),
    {
      name: 'auth-storage-v2',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        impersonationOrigin: state.impersonationOrigin,
      }),
      // User.role (single string) became User.roles (array) when multi-role support shipped.
      // zustand's version/migrate mechanism only fires when the persisted blob already HAS a
      // numeric version — every session cached before today has none at all, so migrate would
      // silently never run for exactly the sessions that need it. Fix the shape directly here
      // instead, since onRehydrateStorage always runs regardless of version.
      onRehydrateStorage: () => (state) => {
        const user = state?.user as (User & { role?: string }) | null | undefined
        if (user && !Array.isArray(user.roles) && typeof user.role === 'string') {
          const { role, ...rest } = user
          if (state) state.user = { ...rest, roles: [role as User['roles'][number]] }
        }
        state?.setHasHydrated(true)
      },
    }
  )
)
