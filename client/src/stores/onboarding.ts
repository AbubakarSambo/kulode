import { create } from 'zustand'

interface OnboardingState {
  isOpen: boolean
  startAtStep: number
  openOnboarding: (step?: number) => void
  closeOnboarding: () => void
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  isOpen: false,
  startAtStep: 1,
  openOnboarding: (step = 1) => set({ isOpen: true, startAtStep: step }),
  closeOnboarding: () => set({ isOpen: false }),
}))
