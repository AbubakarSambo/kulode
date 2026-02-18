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
})
