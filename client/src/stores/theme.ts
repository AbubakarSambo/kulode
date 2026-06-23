import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'light' | 'dark' | 'system'

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const applyTheme = () => {
  const root = window.document.documentElement
  // Temporarily locked to light mode to prevent visual bugs in active dev.
  root.classList.remove('dark')
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'light',
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      setTheme: (_theme) => {
        applyTheme()
        set({ theme: 'light' })
      },
    }),
    {
      name: 'theme-storage',
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.theme = 'light'
          applyTheme()
        }
      },
    }
  )
)
