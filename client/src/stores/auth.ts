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
  setHasHydrated: (hydrated: boolean) => void
  setAuth: (user: User, token: string) => void
  logout: () => void
  updateUser: (user: Partial<User>) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      _hasHydrated: false,

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

      logout: () => {
        localStorage.removeItem('token')
        posthog.reset()
        queryClient.clear()
        set({ user: null, token: null, isAuthenticated: false })
      },

      updateUser: (userData) => {
        set((state) => ({
          user: state.user ? { ...state.user, ...userData } : null,
        }))
      },
    }),
    {
      name: 'auth-storage-v2',
      partialize: (state) => ({ user: state.user, token: state.token, isAuthenticated: state.isAuthenticated }),
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
