import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'light' | 'dark' | 'system'

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const applyTheme = (theme: Theme) => {
  const root = window.document.documentElement
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  if (isDark) {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'system',
      setTheme: (theme) => {
        applyTheme(theme)
        set({ theme })
      },
    }),
    {
      name: 'theme-storage',
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyTheme(state.theme)

          // Setup listener for system theme changes
          const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
          const listener = () => {
            if (useThemeStore.getState().theme === 'system') {
              applyTheme('system')
            }
          }

          // Add listener and clean up previously added ones if any
          mediaQuery.removeEventListener('change', listener)
          mediaQuery.addEventListener('change', listener)
        }
      },
    }
  )
)
