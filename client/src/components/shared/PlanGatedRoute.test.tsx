import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PlanGatedRoute } from './PlanGatedRoute'

const mockUseSubscription = vi.fn()

vi.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => mockUseSubscription(),
}))

function renderGatedRoute(requiredPlan: 'PRO' | 'BUSINESS' = 'PRO') {
  return render(
    <MemoryRouter initialEntries={['/protected']}>
      <Routes>
        <Route element={<PlanGatedRoute requiredPlan={requiredPlan} />}>
          <Route path="/protected" element={<div>Protected Content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('PlanGatedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading spinner while subscription is loading', () => {
    mockUseSubscription.mockReturnValue({
      hasRequiredPlan: () => false,
      isLoading: true,
    })

    const { container } = renderGatedRoute()

    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })

  it('shows upgrade prompt for FREE user accessing PRO route', () => {
    mockUseSubscription.mockReturnValue({
      hasRequiredPlan: (plan: string) => plan === 'FREE',
      isLoading: false,
    })

    renderGatedRoute('PRO')

    expect(screen.getByText('Upgrade to PRO')).toBeInTheDocument()
    expect(screen.getByText(/This feature requires a PRO plan or higher/)).toBeInTheDocument()
    expect(screen.getByText('View Plans & Upgrade')).toBeInTheDocument()
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })

  it('shows upgrade prompt for PRO user accessing BUSINESS route', () => {
    mockUseSubscription.mockReturnValue({
      hasRequiredPlan: (plan: string) => plan === 'FREE' || plan === 'PRO',
      isLoading: false,
    })

    renderGatedRoute('BUSINESS')

    expect(screen.getByText('Upgrade to BUSINESS')).toBeInTheDocument()
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })

  it('renders child route for PRO user on PRO route', () => {
    mockUseSubscription.mockReturnValue({
      hasRequiredPlan: () => true,
      isLoading: false,
    })

    renderGatedRoute('PRO')

    expect(screen.getByText('Protected Content')).toBeInTheDocument()
    expect(screen.queryByText('Upgrade to PRO')).not.toBeInTheDocument()
  })

  it('renders child route for BUSINESS user on PRO route', () => {
    mockUseSubscription.mockReturnValue({
      hasRequiredPlan: () => true,
      isLoading: false,
    })

    renderGatedRoute('PRO')

    expect(screen.getByText('Protected Content')).toBeInTheDocument()
  })

  it('renders child route for grandfathered org', () => {
    mockUseSubscription.mockReturnValue({
      hasRequiredPlan: () => true, // grandfathered always returns true
      isLoading: false,
    })

    renderGatedRoute('PRO')

    expect(screen.getByText('Protected Content')).toBeInTheDocument()
  })

  it('upgrade prompt links to billing page', () => {
    mockUseSubscription.mockReturnValue({
      hasRequiredPlan: () => false,
      isLoading: false,
    })

    renderGatedRoute('PRO')

    const link = screen.getByText('View Plans & Upgrade')
    expect(link.closest('a')).toHaveAttribute('href', '/settings/billing')
  })
})
