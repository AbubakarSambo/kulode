import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UsersPage } from './UsersPage'
import { usersApi } from '@/api/users'
import type { UserData } from '@/api/users'

vi.mock('@/api/users', () => ({
  usersApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    resendInvite: vi.fn(),
    setPin: vi.fn(),
    clearPin: vi.fn(),
  },
}))

vi.mock('@/lib/posthog', () => ({
  posthog: { capture: vi.fn(), identify: vi.fn(), reset: vi.fn() },
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const mockUseOrgModules = vi.fn()
vi.mock('@/hooks/useOrgModules', () => ({
  useOrgModules: () => mockUseOrgModules(),
}))

const mockUseAuthStore = vi.fn()
vi.mock('@/stores/auth', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => mockUseAuthStore(selector),
}))

const CURRENT_USER_ID = 'current-user'

function setCurrentUser(roles: string[]) {
  mockUseAuthStore.mockImplementation((selector: (state: unknown) => unknown) =>
    selector({ user: { id: CURRENT_USER_ID, roles } }),
  )
}

function userWith(overrides: Partial<UserData>): UserData {
  return {
    id: 'user-x',
    email: 'user@acme.com',
    firstName: 'First',
    lastName: 'Last',
    roles: ['STAFF'],
    isActive: true,
    isEmailVerified: true,
    hasPlaceholderEmail: false,
    pinSetAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  } as UserData
}

function paginated(data: UserData[], meta?: Partial<{ total: number; page: number; limit: number; totalPages: number }>) {
  return {
    data,
    meta: { total: data.length, page: 1, limit: 20, totalPages: 1, ...meta },
  }
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <UsersPage />
    </QueryClientProvider>,
  )
}

describe('UsersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: POS org, current user is a SUPER_ADMIN (most permissive baseline for tests
    // that aren't specifically exercising the role-filtering/permission logic).
    mockUseOrgModules.mockReturnValue({ hasPos: true, hasInvoicing: false, enabledModules: 'POS' })
    setCurrentUser(['SUPER_ADMIN'])
  })

  it('renders the team roster once loaded', async () => {
    vi.mocked(usersApi.list).mockResolvedValue(
      paginated([userWith({ id: 'user-1', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@acme.com', roles: ['ADMIN'] })]),
    )

    renderPage()

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText('ada@acme.com')).toBeInTheDocument()
    expect(screen.getByText('Admin')).toBeInTheDocument()
    expect(usersApi.list).toHaveBeenCalledWith({ page: 1, limit: 20 })
  })

  it('shows PIN-login-only in place of an email for placeholder-email accounts', async () => {
    vi.mocked(usersApi.list).mockResolvedValue(
      paginated([userWith({ id: 'user-2', firstName: 'Bola', lastName: 'Waiter', roles: ['WAITER'], hasPlaceholderEmail: true, isEmailVerified: false })]),
    )

    renderPage()

    expect(await screen.findByText('Bola Waiter')).toBeInTheDocument()
    expect(screen.getByText('PIN login only')).toBeInTheDocument()
  })

  describe('status badge', () => {
    it('shows Inactive for a deactivated user regardless of other fields', async () => {
      vi.mocked(usersApi.list).mockResolvedValue(paginated([userWith({ id: 'u1', isActive: false })]))
      renderPage()
      expect(await screen.findByText('Inactive')).toBeInTheDocument()
    })

    it('shows Pending Invite for an active, unverified, non-PIN account', async () => {
      vi.mocked(usersApi.list).mockResolvedValue(
        paginated([userWith({ id: 'u1', isActive: true, isEmailVerified: false, hasPlaceholderEmail: false })]),
      )
      renderPage()
      expect(await screen.findByText('Pending Invite')).toBeInTheDocument()
    })

    it('shows PIN not set for a PIN account that has not set one yet', async () => {
      vi.mocked(usersApi.list).mockResolvedValue(
        paginated([userWith({ id: 'u1', hasPlaceholderEmail: true, isEmailVerified: false, pinSetAt: null })]),
      )
      renderPage()
      expect(await screen.findByText('PIN not set')).toBeInTheDocument()
    })
  })

  describe('pagination', () => {
    it('hides pagination controls when there is only one page', async () => {
      vi.mocked(usersApi.list).mockResolvedValue(paginated([userWith({ id: 'u1' })], { totalPages: 1 }))
      renderPage()
      await screen.findByText('First Last')
      expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument()
    })

    it('advances to the next page and refetches with the new page number', async () => {
      const user = userEvent.setup()
      vi.mocked(usersApi.list).mockResolvedValue(paginated([userWith({ id: 'u1' })], { page: 1, totalPages: 3 }))
      renderPage()

      await screen.findByText('Page 1 of 3')
      expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled()

      await user.click(screen.getByRole('button', { name: 'Next' }))

      await waitFor(() => expect(usersApi.list).toHaveBeenCalledWith({ page: 2, limit: 20 }))
    })
  })

  describe('Invite User modal — role options by org type', () => {
    beforeEach(() => {
      vi.mocked(usersApi.list).mockResolvedValue(paginated([]))
    })

    it('offers POS roles (Waiter, Cashier, etc.) for a POS org', async () => {
      const user = userEvent.setup()
      mockUseOrgModules.mockReturnValue({ hasPos: true, hasInvoicing: false, enabledModules: 'POS' })
      renderPage()
      await user.click(screen.getByText('Invite User'))

      expect(screen.getByRole('button', { name: 'Waiter' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cashier' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Accountant' })).not.toBeInTheDocument()
    })

    it('offers invoicing roles (Accountant, Staff) for a non-POS org', async () => {
      const user = userEvent.setup()
      mockUseOrgModules.mockReturnValue({ hasPos: false, hasInvoicing: true, enabledModules: 'INVOICING' })
      renderPage()
      await user.click(screen.getByText('Invite User'))

      expect(screen.getByRole('button', { name: 'Accountant' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Staff' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Waiter' })).not.toBeInTheDocument()
    })

    it('hides the Admin option from a non-Super-Admin inviter', async () => {
      const user = userEvent.setup()
      setCurrentUser(['ADMIN'])
      renderPage()
      await user.click(screen.getByText('Invite User'))

      expect(screen.queryByRole('button', { name: 'Admin' })).not.toBeInTheDocument()
    })

    it('offers the Admin option to a Super Admin inviter', async () => {
      const user = userEvent.setup()
      setCurrentUser(['SUPER_ADMIN'])
      renderPage()
      await user.click(screen.getByText('Invite User'))

      expect(screen.getByRole('button', { name: 'Admin' })).toBeInTheDocument()
    })
  })

  describe('creating a user', () => {
    beforeEach(() => {
      vi.mocked(usersApi.list).mockResolvedValue(paginated([]))
    })

    it('creates a PIN-only account without requiring an email (default role is PIN-eligible)', async () => {
      const user = userEvent.setup()
      vi.mocked(usersApi.create).mockResolvedValue(userWith({ id: 'new-1' }))
      renderPage()

      await user.click(screen.getByText('Invite User'))
      await user.type(screen.getByLabelText(/first name/i), 'Grace')
      await user.type(screen.getByLabelText(/last name/i), 'Hopper')
      // WAITER is selected by default for a POS org and is PIN-eligible, so no email is required.
      await user.click(screen.getByRole('button', { name: 'Create Account' }))

      await waitFor(() =>
        expect(usersApi.create).toHaveBeenCalledWith(
          expect.objectContaining({ firstName: 'Grace', lastName: 'Hopper', roles: ['WAITER'] }),
        ),
      )
    })

    it('requires an email once a non-PIN-eligible role (e.g. Admin) is selected', async () => {
      const user = userEvent.setup()
      renderPage()

      await user.click(screen.getByText('Invite User'))
      await user.type(screen.getByLabelText(/first name/i), 'Grace')
      await user.type(screen.getByLabelText(/last name/i), 'Hopper')
      await user.click(screen.getByRole('button', { name: 'Admin' }))
      // No email was typed, so the submit button still reads "Create Account" (it only
      // switches to "Send Invitation" once an email is present) — the role-based validation
      // fires regardless of which label is showing.
      await user.click(screen.getByRole('button', { name: 'Create Account' }))

      expect(await screen.findByText('Email is required for this role')).toBeInTheDocument()
      expect(usersApi.create).not.toHaveBeenCalled()
    })
  })

  describe('editing roles', () => {
    it('only offers the edit action for users this account is allowed to modify', async () => {
      setCurrentUser(['ADMIN']) // not a Super Admin
      vi.mocked(usersApi.list).mockResolvedValue(
        paginated([
          userWith({ id: 'self', firstName: 'Me', lastName: 'Self' }), // is the current user
          userWith({ id: 'other-admin', firstName: 'Other', lastName: 'Admin', roles: ['ADMIN'] }), // ADMIN, editor isn't SUPER_ADMIN
          userWith({ id: 'staff-1', firstName: 'Regular', lastName: 'Staff', roles: ['STAFF'] }),
        ]),
      )
      mockUseAuthStore.mockImplementation((selector: (state: unknown) => unknown) =>
        selector({ user: { id: 'self', roles: ['ADMIN'] } }),
      )

      renderPage()
      await screen.findByText('Me Self')

      expect(within(screen.getByText('Me Self').closest('tr')!).queryByTitle('Edit roles')).not.toBeInTheDocument()
      expect(within(screen.getByText('Other Admin').closest('tr')!).queryByTitle('Edit roles')).not.toBeInTheDocument()
      expect(within(screen.getByText('Regular Staff').closest('tr')!).getByTitle('Edit roles')).toBeInTheDocument()
    })

    it('submits the updated role set for the target user', async () => {
      const user = userEvent.setup()
      vi.mocked(usersApi.list).mockResolvedValue(
        paginated([userWith({ id: 'staff-1', firstName: 'Regular', lastName: 'Staff', roles: ['WAITER'] })]),
      )
      vi.mocked(usersApi.update).mockResolvedValue(userWith({ id: 'staff-1', roles: ['WAITER', 'CASHIER'] }))

      renderPage()
      await screen.findByText('Regular Staff')

      const row = screen.getByText('Regular Staff').closest('tr')!
      await user.click(within(row).getByTitle('Edit roles'))

      await user.click(screen.getByRole('button', { name: 'Cashier' }))
      await user.click(screen.getByRole('button', { name: 'Save Roles' }))

      await waitFor(() =>
        expect(usersApi.update).toHaveBeenCalledWith('staff-1', { roles: expect.arrayContaining(['WAITER', 'CASHIER']) }),
      )
    })
  })

  describe('quick-login PIN actions', () => {
    it('sets a PIN for an eligible account with no PIN yet', async () => {
      const user = userEvent.setup()
      vi.mocked(usersApi.list).mockResolvedValue(
        paginated([userWith({ id: 'waiter-1', firstName: 'Bola', lastName: 'Waiter', roles: ['WAITER'], hasPlaceholderEmail: true, isEmailVerified: false, pinSetAt: null })]),
      )
      vi.mocked(usersApi.setPin).mockResolvedValue({ message: 'ok' })

      renderPage()
      const row = await screen.findByText('Bola Waiter').then((el) => el.closest('tr')!)
      expect(within(row).queryByTitle('Remove PIN')).not.toBeInTheDocument()

      await user.click(within(row).getByTitle('Set quick-login PIN'))
      await user.type(screen.getByLabelText(/pin/i), '4821')
      await user.click(screen.getByRole('button', { name: 'Save PIN' }))

      await waitFor(() => expect(usersApi.setPin).toHaveBeenCalledWith('waiter-1', '4821'))
    })

    it('removes an existing PIN after confirmation', async () => {
      const user = userEvent.setup()
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      vi.mocked(usersApi.list).mockResolvedValue(
        paginated([userWith({ id: 'cashier-1', firstName: 'Chidi', lastName: 'Cashier', roles: ['CASHIER'], hasPlaceholderEmail: true, isEmailVerified: false, pinSetAt: new Date().toISOString() })]),
      )
      vi.mocked(usersApi.clearPin).mockResolvedValue({ message: 'ok' })

      renderPage()
      const row = await screen.findByText('Chidi Cashier').then((el) => el.closest('tr')!)

      await user.click(within(row).getByTitle('Remove PIN'))

      expect(window.confirm).toHaveBeenCalled()
      await waitFor(() => expect(usersApi.clearPin).toHaveBeenCalledWith('cashier-1'))
    })

    it('does not remove a PIN if the confirmation is dismissed', async () => {
      const user = userEvent.setup()
      vi.spyOn(window, 'confirm').mockReturnValue(false)
      vi.mocked(usersApi.list).mockResolvedValue(
        paginated([userWith({ id: 'cashier-1', firstName: 'Chidi', lastName: 'Cashier', roles: ['CASHIER'], hasPlaceholderEmail: true, isEmailVerified: false, pinSetAt: new Date().toISOString() })]),
      )

      renderPage()
      const row = await screen.findByText('Chidi Cashier').then((el) => el.closest('tr')!)
      await user.click(within(row).getByTitle('Remove PIN'))

      expect(usersApi.clearPin).not.toHaveBeenCalled()
    })
  })

  describe('resending an invite', () => {
    it('is only offered for an active, unverified, non-PIN account', async () => {
      const user = userEvent.setup()
      vi.mocked(usersApi.list).mockResolvedValue(
        paginated([userWith({ id: 'pending-1', firstName: 'Dele', lastName: 'Pending', isActive: true, isEmailVerified: false, hasPlaceholderEmail: false })]),
      )
      vi.mocked(usersApi.resendInvite).mockResolvedValue({ message: 'Invite resent' })

      renderPage()
      const row = await screen.findByText('Dele Pending').then((el) => el.closest('tr')!)

      await user.click(within(row).getByTitle('Resend invite'))
      await waitFor(() => expect(usersApi.resendInvite).toHaveBeenCalledWith('pending-1'))
    })
  })

  describe('deactivating a user', () => {
    it('deactivates after confirmation and does not offer deactivation for a Super Admin', async () => {
      const user = userEvent.setup()
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      vi.mocked(usersApi.list).mockResolvedValue(
        paginated([
          userWith({ id: 'staff-1', firstName: 'Regular', lastName: 'Staff', roles: ['STAFF'] }),
          userWith({ id: 'super-1', firstName: 'Root', lastName: 'Owner', roles: ['SUPER_ADMIN'] }),
        ]),
      )
      vi.mocked(usersApi.delete).mockResolvedValue(undefined)

      renderPage()
      await screen.findByText('Regular Staff')

      const superRow = screen.getByText('Root Owner').closest('tr')!
      // No accessible name at all identifies the icon-only deactivate button — a Super Admin
      // row should have none.
      expect(within(superRow).queryByRole('button', { name: '' })).not.toBeInTheDocument()

      const staffRow = screen.getByText('Regular Staff').closest('tr')!
      await user.click(within(staffRow).getByRole('button', { name: '' }))

      expect(window.confirm).toHaveBeenCalled()
      await waitFor(() => expect(usersApi.delete).toHaveBeenCalledWith('staff-1'))
    })
  })
})
