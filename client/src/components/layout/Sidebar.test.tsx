import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Sidebar } from './Sidebar'

const mockUseSubscription = vi.fn()
const mockUseAuthStore = vi.fn()
const mockLogout = vi.fn()

vi.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => mockUseSubscription(),
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: (selector: any) => selector({ user: mockUseAuthStore() }),
}))

vi.mock('@/hooks', () => ({
  useLogout: () => mockLogout,
}))

const adminUser = {
  id: 'u1',
  email: 'admin@test.com',
  firstName: 'Test',
  lastName: 'Admin',
  role: 'SUPER_ADMIN' as const,
  organizationId: 'org1',
  organizationName: 'Test Org',
  isPlatformAdmin: false,
}

function renderSidebar() {
  return render(
    <MemoryRouter>
      <Sidebar isOpen />
    </MemoryRouter>,
  )
}

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuthStore.mockReturnValue(adminUser)
  })

  it('shows lock icons on restricted nav items for FREE user', () => {
    mockUseSubscription.mockReturnValue({
      hasRequiredPlan: (plan: string) => plan !== 'PRO' && plan !== 'BUSINESS',
    })

    renderSidebar()

    // These items require PRO and should show lock icons
    const dashboard = screen.getByText('Dashboard').closest('a')!
    const vendors = screen.getByText('Vendors').closest('a')!
    const expenses = screen.getByText('Expenses').closest('a')!
    const reports = screen.getByText('Reports').closest('a')!

    // Lock icon is an SVG with class containing opacity-50
    expect(dashboard.querySelector('.opacity-50')).toBeInTheDocument()
    expect(vendors.querySelector('.opacity-50')).toBeInTheDocument()
    expect(expenses.querySelector('.opacity-50')).toBeInTheDocument()
    expect(reports.querySelector('.opacity-50')).toBeInTheDocument()

    // These items don't require PRO — no lock icon
    const clients = screen.getByText('Clients').closest('a')!
    const invoices = screen.getByText('Invoices').closest('a')!
    const payments = screen.getByText('Payments').closest('a')!

    expect(clients.querySelector('.opacity-50')).not.toBeInTheDocument()
    expect(invoices.querySelector('.opacity-50')).not.toBeInTheDocument()
    expect(payments.querySelector('.opacity-50')).not.toBeInTheDocument()
  })

  it('shows no lock icons for PRO user', () => {
    mockUseSubscription.mockReturnValue({
      hasRequiredPlan: () => true,
    })

    renderSidebar()

    const dashboard = screen.getByText('Dashboard').closest('a')!
    const vendors = screen.getByText('Vendors').closest('a')!
    const expenses = screen.getByText('Expenses').closest('a')!
    const reports = screen.getByText('Reports').closest('a')!

    expect(dashboard.querySelector('.opacity-50')).not.toBeInTheDocument()
    expect(vendors.querySelector('.opacity-50')).not.toBeInTheDocument()
    expect(expenses.querySelector('.opacity-50')).not.toBeInTheDocument()
    expect(reports.querySelector('.opacity-50')).not.toBeInTheDocument()
  })

  it('shows no lock icons for grandfathered user', () => {
    mockUseSubscription.mockReturnValue({
      hasRequiredPlan: () => true, // grandfathered always returns true
    })

    renderSidebar()

    const navLinks = screen.getAllByRole('link')
    navLinks.forEach((link) => {
      expect(link.querySelector('.opacity-50')).not.toBeInTheDocument()
    })
  })

  it('restricted nav items are still clickable (navigation allowed)', () => {
    mockUseSubscription.mockReturnValue({
      hasRequiredPlan: () => false,
    })

    renderSidebar()

    const dashboard = screen.getByText('Dashboard').closest('a')!
    expect(dashboard).toHaveAttribute('href', '/dashboard')

    const vendors = screen.getByText('Vendors').closest('a')!
    expect(vendors).toHaveAttribute('href', '/vendors')
  })

  it('shows all nav items for admin user regardless of plan', () => {
    mockUseSubscription.mockReturnValue({
      hasRequiredPlan: () => false,
    })

    renderSidebar()

    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Clients')).toBeInTheDocument()
    expect(screen.getByText('Invoices')).toBeInTheDocument()
    expect(screen.getByText('Payments')).toBeInTheDocument()
    expect(screen.getByText('Vendors')).toBeInTheDocument()
    expect(screen.getByText('Expenses')).toBeInTheDocument()
    expect(screen.getByText('Reports')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('hides payments/expenses/vendors for STAFF role', () => {
    mockUseAuthStore.mockReturnValue({ ...adminUser, role: 'STAFF' })
    mockUseSubscription.mockReturnValue({
      hasRequiredPlan: () => true,
    })

    renderSidebar()

    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Clients')).toBeInTheDocument()
    expect(screen.getByText('Invoices')).toBeInTheDocument()
    expect(screen.queryByText('Payments')).not.toBeInTheDocument()
    expect(screen.queryByText('Vendors')).not.toBeInTheDocument()
    expect(screen.queryByText('Expenses')).not.toBeInTheDocument()
  })
})
