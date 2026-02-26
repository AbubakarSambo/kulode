import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TrialBanner } from './TrialBanner'

const mockUseSubscription = vi.fn()

vi.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => mockUseSubscription(),
}))

function renderBanner() {
  return render(
    <MemoryRouter>
      <TrialBanner />
    </MemoryRouter>,
  )
}

describe('TrialBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows amber trial banner with days remaining', () => {
    mockUseSubscription.mockReturnValue({
      isTrial: true,
      isExpired: false,
      isActive: false,
      isGrandfathered: false,
      trialDaysRemaining: 15,
      isLoading: false,
    })

    renderBanner()

    expect(screen.getByText(/15 days left in your Pro trial/)).toBeInTheDocument()
    expect(screen.getByText('Upgrade now')).toBeInTheDocument()
  })

  it('shows singular "day" when 1 day remaining', () => {
    mockUseSubscription.mockReturnValue({
      isTrial: true,
      isExpired: false,
      isActive: false,
      isGrandfathered: false,
      trialDaysRemaining: 1,
      isLoading: false,
    })

    renderBanner()

    expect(screen.getByText(/1 day left in your Pro trial/)).toBeInTheDocument()
  })

  it('shows red expired banner when trial has ended', () => {
    mockUseSubscription.mockReturnValue({
      isTrial: true,
      isExpired: true,
      isActive: false,
      isGrandfathered: false,
      trialDaysRemaining: 0,
      isLoading: false,
    })

    renderBanner()

    expect(screen.getByText(/Your Pro trial has ended/)).toBeInTheDocument()
    expect(screen.getByText('Upgrade to continue')).toBeInTheDocument()
  })

  it('shows red expired banner when subscription status is EXPIRED', () => {
    mockUseSubscription.mockReturnValue({
      isTrial: false,
      isExpired: true,
      isActive: false,
      isGrandfathered: false,
      trialDaysRemaining: null,
      isLoading: false,
    })

    renderBanner()

    expect(screen.getByText(/Your Pro trial has ended/)).toBeInTheDocument()
  })

  it('renders nothing for active subscriber', () => {
    mockUseSubscription.mockReturnValue({
      isTrial: false,
      isExpired: false,
      isActive: true,
      isGrandfathered: false,
      trialDaysRemaining: null,
      isLoading: false,
    })

    const { container } = renderBanner()

    expect(container.innerHTML).toBe('')
  })

  it('renders nothing for grandfathered org', () => {
    mockUseSubscription.mockReturnValue({
      isTrial: false,
      isExpired: false,
      isActive: false,
      isGrandfathered: true,
      trialDaysRemaining: null,
      isLoading: false,
    })

    const { container } = renderBanner()

    expect(container.innerHTML).toBe('')
  })

  it('renders nothing while loading', () => {
    mockUseSubscription.mockReturnValue({
      isTrial: false,
      isExpired: false,
      isActive: false,
      isGrandfathered: false,
      trialDaysRemaining: null,
      isLoading: true,
    })

    const { container } = renderBanner()

    expect(container.innerHTML).toBe('')
  })

  it('links to billing page', () => {
    mockUseSubscription.mockReturnValue({
      isTrial: true,
      isExpired: false,
      isActive: false,
      isGrandfathered: false,
      trialDaysRemaining: 10,
      isLoading: false,
    })

    renderBanner()

    const link = screen.getByText('Upgrade now')
    expect(link.closest('a')).toHaveAttribute('href', '/settings/billing')
  })

  // ─── Over-user-limit warnings ──────────────────────────────────────

  it('shows user-limit warning when expired trial has more active users than free plan allows', () => {
    mockUseSubscription.mockReturnValue({
      subscription: {
        usage: { activeUsers: 3 },
        limits: { maxUsers: 1 },
      },
      isTrial: true,
      isExpired: true,
      isActive: false,
      isGrandfathered: false,
      trialDaysRemaining: 0,
      isLoading: false,
    })

    renderBanner()

    expect(screen.getByText(/3 active users/)).toBeInTheDocument()
    expect(screen.getByText(/Free plan allows 1/)).toBeInTheDocument()
  })

  it('shows remove-users link and upgrade link when over user limit', () => {
    mockUseSubscription.mockReturnValue({
      subscription: {
        usage: { activeUsers: 2 },
        limits: { maxUsers: 1 },
      },
      isTrial: false,
      isExpired: true,
      isActive: false,
      isGrandfathered: false,
      trialDaysRemaining: null,
      isLoading: false,
    })

    renderBanner()

    const removeLink = screen.getByText('Remove users')
    expect(removeLink.closest('a')).toHaveAttribute('href', '/settings/users')

    const upgradeLinks = screen.getAllByText('upgrade')
    expect(upgradeLinks[0].closest('a')).toHaveAttribute('href', '/settings/billing')
  })

  it('does not show user-limit warning when within free plan user limit after trial expires', () => {
    mockUseSubscription.mockReturnValue({
      subscription: {
        usage: { activeUsers: 1 },
        limits: { maxUsers: 1 },
      },
      isTrial: true,
      isExpired: true,
      isActive: false,
      isGrandfathered: false,
      trialDaysRemaining: 0,
      isLoading: false,
    })

    renderBanner()

    expect(screen.queryByText(/active users/)).not.toBeInTheDocument()
    expect(screen.queryByText('Remove users')).not.toBeInTheDocument()
  })

  it('does not show user-limit warning during an active trial even if over future free limit', () => {
    mockUseSubscription.mockReturnValue({
      subscription: {
        usage: { activeUsers: 3 },
        limits: { maxUsers: 1 },
      },
      isTrial: true,
      isExpired: false,
      isActive: false,
      isGrandfathered: false,
      trialDaysRemaining: 5,
      isLoading: false,
    })

    renderBanner()

    // Shows the trial countdown banner, NOT the user-limit warning
    expect(screen.getByText(/5 days left in your Pro trial/)).toBeInTheDocument()
    expect(screen.queryByText('Remove users')).not.toBeInTheDocument()
  })
})
