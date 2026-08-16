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
  useAuthStore: <T,>(selector: (state: { user: Record<string, unknown> }) => T) => selector({ user: mockUseAuthStore() }),
}))

const mockSwitchUser = vi.fn()

vi.mock('@/hooks', () => ({
  useLogout: () => mockLogout,
  useSwitchUser: () => mockSwitchUser,
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: {
      percent: 40,
      steps: [
        { id: 'profile', label: 'Personalize Profile', completed: true },
        { id: 'bank', label: 'Link Settlement Bank', completed: false },
        { id: 'client', label: 'Register First Client', completed: false },
        { id: 'item', label: 'Add Billing Details', completed: false },
        { id: 'invoice', label: 'Preview & Send', completed: false },
      ],
    },
  }),
}))

const adminUser = {
  id: 'u1',
  email: 'admin@test.com',
  firstName: 'Test',
  lastName: 'Admin',
  roles: ['SUPER_ADMIN'] as const,
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
    // Sidebar defaults to collapsed (localStorage unset), which renders both the nav
    // label and a hover tooltip with the same text. Force expanded so each nav item's
    // label appears exactly once, matching what getByText (singular) assertions expect.
    localStorage.setItem('sidebar-collapsed', 'false')
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

    // Lock icon is an SVG with class containing opacity-40
    expect(dashboard.querySelector('.opacity-40')).toBeInTheDocument()
    expect(vendors.querySelector('.opacity-40')).toBeInTheDocument()
    expect(expenses.querySelector('.opacity-40')).toBeInTheDocument()
    expect(reports.querySelector('.opacity-40')).toBeInTheDocument()

    // These items don't require PRO — no lock icon
    const clients = screen.getByText('Clients').closest('a')!
    const invoices = screen.getByText('Invoices').closest('a')!
    const payments = screen.getByText('Payments').closest('a')!

    expect(clients.querySelector('.opacity-40')).not.toBeInTheDocument()
    expect(invoices.querySelector('.opacity-40')).not.toBeInTheDocument()
    expect(payments.querySelector('.opacity-40')).not.toBeInTheDocument()
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

    expect(dashboard.querySelector('.opacity-40')).not.toBeInTheDocument()
    expect(vendors.querySelector('.opacity-40')).not.toBeInTheDocument()
    expect(expenses.querySelector('.opacity-40')).not.toBeInTheDocument()
    expect(reports.querySelector('.opacity-40')).not.toBeInTheDocument()
  })

  it('shows no lock icons for grandfathered user', () => {
    mockUseSubscription.mockReturnValue({
      hasRequiredPlan: () => true, // grandfathered always returns true
    })

    renderSidebar()

    const navLinks = screen.getAllByRole('link')
    navLinks.forEach((link) => {
      expect(link.querySelector('.opacity-40')).not.toBeInTheDocument()
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
    mockUseAuthStore.mockReturnValue({ ...adminUser, roles: ['STAFF'] })
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

  it('a multi-role user sees the UNION of what each role unlocks (Waiter + Pass)', () => {
    mockUseAuthStore.mockReturnValue({
      ...adminUser,
      roles: ['WAITER', 'PASS'],
      organization: { enabledModules: 'POS' },
    })
    mockUseSubscription.mockReturnValue({ hasRequiredPlan: () => true })

    renderSidebar()

    // Waiter's allowlist
    expect(screen.getAllByText('Sell').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Orders').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Customers').length).toBeGreaterThan(0)
    // Pass's allowlist
    expect(screen.getAllByText('Kitchen').length).toBeGreaterThan(0)
    // Neither role grants these
    expect(screen.queryByText('Menu')).not.toBeInTheDocument()
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
  })

  it('an unrestricted role in the mix (e.g. Manager + Waiter) gets the full broader nav', () => {
    mockUseAuthStore.mockReturnValue({
      ...adminUser,
      roles: ['WAITER', 'MANAGER'],
      organization: { enabledModules: 'POS' },
    })
    mockUseSubscription.mockReturnValue({ hasRequiredPlan: () => true })

    renderSidebar()

    // Manager isn't floor-restricted, so the union should include the full POS nav, not just
    // Waiter's tight allowlist.
    expect(screen.getAllByText('Menu').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Categories').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Kitchen').length).toBeGreaterThan(0)
  })

  it('a pure Cashier is restricted to Orders/Customers/Shift only', () => {
    mockUseAuthStore.mockReturnValue({
      ...adminUser,
      roles: ['CASHIER'],
      organization: { enabledModules: 'POS' },
    })
    mockUseSubscription.mockReturnValue({ hasRequiredPlan: () => true })

    renderSidebar()

    expect(screen.getAllByText('Orders').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Customers').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Shift').length).toBeGreaterThan(0)
    expect(screen.queryByText('Sell')).not.toBeInTheDocument()
    expect(screen.queryByText('Menu')).not.toBeInTheDocument()
    expect(screen.queryByText('Waiters')).not.toBeInTheDocument()
    expect(screen.queryByText('Kitchen')).not.toBeInTheDocument()
  })

  it('Waiter + Runner + Cashier sees the union: Sell/Orders/Customers/Shift + Kitchen', () => {
    mockUseAuthStore.mockReturnValue({
      ...adminUser,
      roles: ['WAITER', 'RUNNER', 'CASHIER'],
      organization: { enabledModules: 'POS' },
    })
    mockUseSubscription.mockReturnValue({ hasRequiredPlan: () => true })

    renderSidebar()

    expect(screen.getAllByText('Sell').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Orders').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Customers').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Shift').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Kitchen').length).toBeGreaterThan(0)
    expect(screen.queryByText('Menu')).not.toBeInTheDocument()
    expect(screen.queryByText('Waiters')).not.toBeInTheDocument()
  })

  it('hides the entire Restaurant POS group for an INVOICING-only org, even for an unrestricted role', () => {
    mockUseAuthStore.mockReturnValue({
      ...adminUser,
      roles: ['MANAGER'],
      organization: { enabledModules: 'INVOICING' },
    })
    mockUseSubscription.mockReturnValue({ hasRequiredPlan: () => true })

    renderSidebar()

    expect(screen.queryByText('Sell')).not.toBeInTheDocument()
    expect(screen.queryByText('Menu')).not.toBeInTheDocument()
    expect(screen.queryByText('Kitchen')).not.toBeInTheDocument()
    expect(screen.queryByText('Waiters')).not.toBeInTheDocument()
    // Invoicing side is unaffected
    expect(screen.getAllByText('Invoices').length).toBeGreaterThan(0)
  })

  it('shows the Restaurant POS group (but no invoicing items) for a POS-only org with an unrestricted role', () => {
    mockUseAuthStore.mockReturnValue({
      ...adminUser,
      roles: ['MANAGER'],
      organization: { enabledModules: 'POS' },
    })
    mockUseSubscription.mockReturnValue({ hasRequiredPlan: () => true })

    renderSidebar()

    expect(screen.getAllByText('Sell').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Menu').length).toBeGreaterThan(0)
    expect(screen.queryByText('Invoices')).not.toBeInTheDocument()
    expect(screen.queryByText('Clients')).not.toBeInTheDocument()
    // The invoicing "/dashboard" link is hidden, but the POS "/pos/dashboard" link (also named
    // "Dashboard") is shown — so assert on href rather than the ambiguous label text.
    expect(screen.queryAllByText('Dashboard').some((el) => el.closest('a')?.getAttribute('href') === '/dashboard')).toBe(false)
    expect(screen.queryAllByText('Dashboard').some((el) => el.closest('a')?.getAttribute('href') === '/pos/dashboard')).toBe(true)
    expect(screen.queryByText('Reports')).not.toBeInTheDocument()
  })

  it('shows both POS and invoicing nav when the org has BOTH modules enabled', () => {
    mockUseAuthStore.mockReturnValue({
      ...adminUser,
      roles: ['MANAGER'],
      organization: { enabledModules: 'BOTH' },
    })
    mockUseSubscription.mockReturnValue({ hasRequiredPlan: () => true })

    renderSidebar()

    expect(screen.getAllByText('Sell').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Invoices').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Clients').length).toBeGreaterThan(0)
  })

  it('hides Reports/AI Chat for a non-admin, non-accountant STAFF user', () => {
    mockUseAuthStore.mockReturnValue({
      ...adminUser,
      roles: ['STAFF'],
    })
    mockUseSubscription.mockReturnValue({ hasRequiredPlan: () => true })

    renderSidebar()

    expect(screen.queryByText('Reports')).not.toBeInTheDocument()
    expect(screen.queryByText('AI Chat')).not.toBeInTheDocument()
  })

  it('shows Reports/AI Chat for an ACCOUNTANT even though they are not an admin', () => {
    mockUseAuthStore.mockReturnValue({
      ...adminUser,
      roles: ['ACCOUNTANT'],
    })
    mockUseSubscription.mockReturnValue({ hasRequiredPlan: () => true })

    renderSidebar()

    expect(screen.getAllByText('Reports').length).toBeGreaterThan(0)
    expect(screen.getAllByText('AI Chat').length).toBeGreaterThan(0)
    // Accountant is not admin, so no Configuration/admin nav
    expect(screen.queryByText('Users')).not.toBeInTheDocument()
    expect(screen.queryByText('Billing & Plans')).not.toBeInTheDocument()
  })

  it('does not show admin-only nav (Users, Settings, Billing) for restricted floor roles', () => {
    mockUseAuthStore.mockReturnValue({
      ...adminUser,
      roles: ['WAITER'],
      organization: { enabledModules: 'POS' },
    })
    mockUseSubscription.mockReturnValue({ hasRequiredPlan: () => true })

    renderSidebar()

    expect(screen.queryByText('Users')).not.toBeInTheDocument()
    expect(screen.queryByText('Settings')).not.toBeInTheDocument()
    expect(screen.queryByText('Billing & Plans')).not.toBeInTheDocument()
  })

  it('a pure Pass (kitchen-only) role sees only the Kitchen board in the POS group', () => {
    mockUseAuthStore.mockReturnValue({
      ...adminUser,
      roles: ['PASS'],
      organization: { enabledModules: 'POS' },
    })
    mockUseSubscription.mockReturnValue({ hasRequiredPlan: () => true })

    renderSidebar()

    expect(screen.getAllByText('Kitchen').length).toBeGreaterThan(0)
    expect(screen.queryByText('Sell')).not.toBeInTheDocument()
    expect(screen.queryByText('Orders')).not.toBeInTheDocument()
    expect(screen.queryByText('Customers')).not.toBeInTheDocument()
  })

  it('a pure Waiter (single role) is restricted to Sell/Orders/Customers only', () => {
    mockUseAuthStore.mockReturnValue({
      ...adminUser,
      roles: ['WAITER'],
      organization: { enabledModules: 'POS' },
    })
    mockUseSubscription.mockReturnValue({ hasRequiredPlan: () => true })

    renderSidebar()

    expect(screen.getAllByText('Sell').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Orders').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Customers').length).toBeGreaterThan(0)
    expect(screen.queryByText('Menu')).not.toBeInTheDocument()
    expect(screen.queryByText('Kitchen')).not.toBeInTheDocument()
    expect(screen.queryByText('Waiters')).not.toBeInTheDocument()
    expect(screen.queryByText('Shift')).not.toBeInTheDocument()
  })

  it('a pure Supervisor is restricted to Orders/Customers/Shift/Kitchen (no menu editing, no Waiters roster)', () => {
    mockUseAuthStore.mockReturnValue({
      ...adminUser,
      roles: ['SUPERVISOR'],
      organization: { enabledModules: 'POS' },
    })
    mockUseSubscription.mockReturnValue({ hasRequiredPlan: () => true })

    renderSidebar()

    expect(screen.getAllByText('Orders').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Customers').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Shift').length).toBeGreaterThan(0)
    // Waiter is just a User now — managing the roster needs the same admin-only access as the
    // rest of user management, so Supervisors no longer get a nav entry for it.
    expect(screen.queryByText('Waiters')).not.toBeInTheDocument()
    expect(screen.getAllByText('Kitchen').length).toBeGreaterThan(0)
    expect(screen.queryByText('Sell')).not.toBeInTheDocument()
    expect(screen.queryByText('Menu')).not.toBeInTheDocument()
    expect(screen.queryByText('Categories')).not.toBeInTheDocument()
  })
})
