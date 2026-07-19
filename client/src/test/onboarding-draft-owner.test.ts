import { describe, it, expect, beforeEach } from 'vitest'
import {
  claimOnboardingDraftForUser,
  ONBOARDING_OWNER_KEY,
} from '@/components/onboarding/OnboardingContext'

describe('claimOnboardingDraftForUser', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('clears another account\'s stale draft so junk values never pre-fill onboarding', () => {
    localStorage.setItem(ONBOARDING_OWNER_KEY, 'old-user')
    localStorage.setItem('tari1-onboarding-businessName', 'ffrrr')
    localStorage.setItem('tari1-onboarding-clientName', 'Stale Client')

    claimOnboardingDraftForUser('new-user')

    expect(localStorage.getItem('tari1-onboarding-businessName')).toBeNull()
    expect(localStorage.getItem('tari1-onboarding-clientName')).toBeNull()
    expect(localStorage.getItem(ONBOARDING_OWNER_KEY)).toBe('new-user')
  })

  it('clears an unowned legacy draft on first claim', () => {
    localStorage.setItem('tari1-onboarding-businessName', 'ffrrr')

    claimOnboardingDraftForUser('user-1')

    expect(localStorage.getItem('tari1-onboarding-businessName')).toBeNull()
    expect(localStorage.getItem(ONBOARDING_OWNER_KEY)).toBe('user-1')
  })

  it('preserves the same user\'s in-progress draft', () => {
    claimOnboardingDraftForUser('user-1')
    localStorage.setItem('tari1-onboarding-businessName', 'Amina Ventures Ltd')

    claimOnboardingDraftForUser('user-1')

    expect(localStorage.getItem('tari1-onboarding-businessName')).toBe('Amina Ventures Ltd')
  })

  it('does nothing while the user is not yet known', () => {
    localStorage.setItem('tari1-onboarding-businessName', 'draft')

    claimOnboardingDraftForUser(undefined)

    expect(localStorage.getItem('tari1-onboarding-businessName')).toBe('draft')
    expect(localStorage.getItem(ONBOARDING_OWNER_KEY)).toBeNull()
  })
})
