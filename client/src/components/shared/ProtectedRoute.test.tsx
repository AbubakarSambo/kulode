import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProtectedRoute, GuestRoute } from './ProtectedRoute'
import type { User } from '@/types'

const mockUseAuthStore = vi.fn()

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => mockUseAuthStore(),
}))

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u1',
    email: 'user@test.com',
    firstName: 'Test',
    lastName: 'User',
    roles: [],
    organizationId: 'org1',
    organizationName: 'Test Org',
    ...overrides,
  }
}

function renderProtected(initialPath: string, allowedRoles?: User['roles']) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<ProtectedRoute allowedRoles={allowedRoles} />}>
          <Route path="/pos/kitchen" element={<div>Kitchen Screen</div>} />
          <Route path="/dashboard" element={<div>Dashboard Screen</div>} />
        </Route>
        <Route path="/login" element={<div>Login Screen</div>} />
        <Route path="/pos/order/new" element={<div>Sell Screen</div>} />
        <Route path="/pos/orders" element={<div>Orders Screen</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

function renderGuest(initialPath = '/login') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<GuestRoute />}>
          <Route path="/login" element={<div>Login Screen</div>} />
        </Route>
        <Route path="/dashboard" element={<div>Dashboard Screen</div>} />
        <Route path="/pos/order/new" element={<div>Sell Screen</div>} />
        <Route path="/pos/orders" element={<div>Orders Screen</div>} />
        <Route path="/pos/kitchen" element={<div>Kitchen Screen</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows a loading state until the auth store has hydrated', () => {
    mockUseAuthStore.mockReturnValue({ isAuthenticated: false, user: null, _hasHydrated: false })

    const { container } = renderProtected('/dashboard')

    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
    expect(screen.queryByText('Dashboard Screen')).not.toBeInTheDocument()
  })

  it('redirects an unauthenticated user to /login', () => {
    mockUseAuthStore.mockReturnValue({ isAuthenticated: false, user: null, _hasHydrated: true })

    renderProtected('/dashboard')

    expect(screen.getByText('Login Screen')).toBeInTheDocument()
  })

  it('renders the protected content for an authenticated user with no role restriction', () => {
    mockUseAuthStore.mockReturnValue({
      isAuthenticated: true,
      user: makeUser({ roles: ['ADMIN'] }),
      _hasHydrated: true,
    })

    renderProtected('/dashboard')

    expect(screen.getByText('Dashboard Screen')).toBeInTheDocument()
  })

  it('renders the protected content when the user role is in allowedRoles', () => {
    mockUseAuthStore.mockReturnValue({
      isAuthenticated: true,
      user: makeUser({ roles: ['PASS'] }),
      _hasHydrated: true,
    })

    renderProtected('/pos/kitchen', ['PASS', 'RUNNER'])

    expect(screen.getByText('Kitchen Screen')).toBeInTheDocument()
  })

  it('bounces a user whose role is NOT in allowedRoles to their own post-auth route, not the requested page', () => {
    // A WAITER hitting the Kitchen-only route should be sent to their Sell screen, never shown Kitchen.
    mockUseAuthStore.mockReturnValue({
      isAuthenticated: true,
      user: makeUser({ roles: ['WAITER'] }),
      _hasHydrated: true,
    })

    renderProtected('/pos/kitchen', ['PASS', 'RUNNER'])

    expect(screen.queryByText('Kitchen Screen')).not.toBeInTheDocument()
    expect(screen.getByText('Sell Screen')).toBeInTheDocument()
  })

  it('bounces a CASHIER away from a Waiter/Kitchen-only route to their Orders screen', () => {
    mockUseAuthStore.mockReturnValue({
      isAuthenticated: true,
      user: makeUser({ roles: ['CASHIER'] }),
      _hasHydrated: true,
    })

    renderProtected('/pos/kitchen', ['PASS', 'RUNNER'])

    expect(screen.queryByText('Kitchen Screen')).not.toBeInTheDocument()
    expect(screen.getByText('Orders Screen')).toBeInTheDocument()
  })
})

describe('GuestRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows a loading state until the auth store has hydrated', () => {
    mockUseAuthStore.mockReturnValue({ isAuthenticated: false, user: null, _hasHydrated: false })

    const { container } = renderGuest()

    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('renders the guest page (login) for an unauthenticated visitor', () => {
    mockUseAuthStore.mockReturnValue({ isAuthenticated: false, user: null, _hasHydrated: true })

    renderGuest()

    expect(screen.getByText('Login Screen')).toBeInTheDocument()
  })

  it('redirects an already-authenticated WAITER away from /login to their Sell screen', () => {
    mockUseAuthStore.mockReturnValue({
      isAuthenticated: true,
      user: makeUser({ roles: ['WAITER'] }),
      _hasHydrated: true,
    })

    renderGuest('/login')

    expect(screen.queryByText('Login Screen')).not.toBeInTheDocument()
    expect(screen.getByText('Sell Screen')).toBeInTheDocument()
  })

  it('redirects an already-authenticated CASHIER away from /login to the Orders screen', () => {
    mockUseAuthStore.mockReturnValue({
      isAuthenticated: true,
      user: makeUser({ roles: ['CASHIER'] }),
      _hasHydrated: true,
    })

    renderGuest('/login')

    expect(screen.getByText('Orders Screen')).toBeInTheDocument()
  })

  it('redirects an already-authenticated PASS user away from /login to the Kitchen board', () => {
    mockUseAuthStore.mockReturnValue({
      isAuthenticated: true,
      user: makeUser({ roles: ['PASS'] }),
      _hasHydrated: true,
    })

    renderGuest('/login')

    expect(screen.getByText('Kitchen Screen')).toBeInTheDocument()
  })

  it('redirects an already-authenticated unrestricted (ADMIN) user to the module-based default', () => {
    mockUseAuthStore.mockReturnValue({
      isAuthenticated: true,
      user: makeUser({ roles: ['ADMIN'], organization: { id: 'o1', name: 'Org', slug: 'org', isPaystackVerified: false, enabledModules: 'INVOICING' } }),
      _hasHydrated: true,
    })

    renderGuest('/login')

    expect(screen.getByText('Dashboard Screen')).toBeInTheDocument()
  })
})
