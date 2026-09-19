import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OrdersListPage } from './OrdersListPage'
import { ordersApi, tablesApi } from '@/api'
import type { OrderSummary } from '@/api/orders'
import type { Order } from '@/types'

vi.mock('@/api', () => ({
  ordersApi: { listSummary: vi.fn(), get: vi.fn() },
  tablesApi: { list: vi.fn() },
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const mockUseAuthStore = vi.fn()
vi.mock('@/stores/auth', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => mockUseAuthStore(selector),
}))

function setCurrentUser(roles: string[]) {
  mockUseAuthStore.mockImplementation((selector: (state: unknown) => unknown) => selector({ user: { id: 'u1', roles } }))
}

function orderWith(overrides: Partial<OrderSummary>): OrderSummary {
  return {
    id: 'order-abcdef1234',
    tableId: undefined,
    table: null,
    customer: null,
    status: 'OPEN',
    total: 5000,
    amountPaid: 0,
    source: 'DINE_IN',
    createdAt: new Date('2026-01-15T12:00:00Z').toISOString(),
    waiter: undefined,
    createdBy: undefined,
    _count: { items: 2 },
    ...overrides,
  } as OrderSummary
}

function paginated(data: OrderSummary[], meta?: Partial<{ total: number; page: number; limit: number; totalPages: number }>) {
  return {
    data,
    meta: { total: data.length, page: 1, limit: 100, totalPages: 1, ...meta },
  }
}

function renderPage(initialEntries: string[] = ['/pos/orders']) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <OrdersListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('OrdersListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(tablesApi.list).mockResolvedValue([])
    setCurrentUser(['WAITER']) // not a cashier by default — keeps the awaiting-payment poll off
  })

  it('defaults to the Open filter and queries the merged OPEN+IN_KITCHEN statuses', async () => {
    vi.mocked(ordersApi.listSummary).mockResolvedValue(paginated([orderWith({ id: 'order-1' })]))

    renderPage()

    await waitFor(() =>
      expect(ordersApi.listSummary).toHaveBeenCalledWith(
        expect.objectContaining({ statuses: ['OPEN', 'IN_KITCHEN'], page: 1, limit: 100 }),
      ),
    )
    expect(screen.getByDisplayValue('Open')).toBeInTheDocument()
  })

  it('defaults to All Statuses when arriving via a customer history link', async () => {
    vi.mocked(ordersApi.listSummary).mockResolvedValue(paginated([]))

    renderPage(['/pos/orders?customerId=cust-1'])

    await waitFor(() =>
      expect(ordersApi.listSummary).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: 'cust-1', status: undefined }),
      ),
    )
    expect(screen.getByDisplayValue('All Statuses')).toBeInTheDocument()
  })

  // The desktop <table> and the mobile <Card> list both render unconditionally (only hidden via
  // CSS classes `hidden`/`md:hidden`, which jsdom doesn't apply) — so every row's content exists
  // twice in the DOM. Scoping to the table avoids ambiguous "found multiple elements" matches.
  function desktopTable() {
    return screen.getByRole('table')
  }

  it('renders order rows with table, customer, staff, status, and total', async () => {
    vi.mocked(ordersApi.listSummary).mockResolvedValue(
      paginated([
        orderWith({
          id: 'order-abcdef1234',
          table: { id: 't1', name: 'Table 5' },
          customer: { id: 'c1', name: 'Ada Lovelace' },
          waiter: { id: 'w1', firstName: 'Bola', lastName: 'Waiter' },
          status: 'CLOSED_PAID',
          total: 12000,
        }),
      ]),
    )

    renderPage()

    await waitFor(() => expect(within(desktopTable()).getByText('#ORDER-AB')).toBeInTheDocument())
    const table = within(desktopTable())
    expect(table.getByText('Table 5')).toBeInTheDocument()
    expect(table.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(table.getByText('Bola Waiter')).toBeInTheDocument()
    expect(table.getByText('CLOSED PAID')).toBeInTheDocument()
    expect(table.getByText('₦12,000')).toBeInTheDocument()
  })

  it('falls back to the order source and "—" when no table/customer is attached', async () => {
    vi.mocked(ordersApi.listSummary).mockResolvedValue(
      paginated([orderWith({ id: 'order-1', table: null, customer: null, source: 'WALK_IN' })]),
    )

    renderPage()

    await waitFor(() => expect(within(desktopTable()).getByText('WALK_IN'.replace('_', ' '))).toBeInTheDocument())
    // Both the Customer and Staff columns fall back to "—" here (no customer, no waiter/creator).
    expect(within(desktopTable()).getAllByText('—')).toHaveLength(2)
  })

  it('shows the empty state when there are no matching orders', async () => {
    vi.mocked(ordersApi.listSummary).mockResolvedValue(paginated([]))
    renderPage()
    expect(await screen.findByText('No orders found')).toBeInTheDocument()
  })

  describe('filters', () => {
    beforeEach(() => {
      vi.mocked(ordersApi.listSummary).mockResolvedValue(paginated([orderWith({ id: 'order-1' })]))
    })

    it('resets to page 1 and refetches when the status filter changes', async () => {
      const user = userEvent.setup()
      renderPage()
      await waitFor(() => expect(within(desktopTable()).getByText('#ORDER-1')).toBeInTheDocument())

      await user.selectOptions(screen.getByDisplayValue('Open'), 'CANCELLED')

      await waitFor(() =>
        expect(ordersApi.listSummary).toHaveBeenLastCalledWith(
          expect.objectContaining({ status: 'CANCELLED', page: 1 }),
        ),
      )
    })

    it('filters by table', async () => {
      const user = userEvent.setup()
      vi.mocked(tablesApi.list).mockResolvedValue([
        { id: 't1', name: 'Table 5', capacity: 4, status: 'AVAILABLE', isActive: true, sortOrder: 0 },
      ] as never)
      renderPage()

      await screen.findByRole('option', { name: 'Table 5' })
      await user.selectOptions(screen.getByDisplayValue('All Tables'), 't1')

      await waitFor(() => expect(ordersApi.listSummary).toHaveBeenLastCalledWith(expect.objectContaining({ tableId: 't1' })))
    })

    it('debounces search input before querying', async () => {
      const user = userEvent.setup()
      renderPage()
      await screen.findByPlaceholderText(/search order/i)

      await user.type(screen.getByPlaceholderText(/search order/i), 'ada')

      await waitFor(() => expect(ordersApi.listSummary).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'ada' })), {
        timeout: 1000,
      })
    })
  })

  describe('pagination', () => {
    it('hides pagination when there is only one page', async () => {
      vi.mocked(ordersApi.listSummary).mockResolvedValue(paginated([orderWith({ id: 'order-1' })], { totalPages: 1 }))
      renderPage()
      await waitFor(() => expect(within(desktopTable()).getByText('#ORDER-1')).toBeInTheDocument())
      expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument()
    })

    it('advances to the next page', async () => {
      const user = userEvent.setup()
      vi.mocked(ordersApi.listSummary).mockResolvedValue(paginated([orderWith({ id: 'order-1' })], { page: 1, totalPages: 2 }))
      renderPage()

      await screen.findByText('Page 1 of 2')
      await user.click(screen.getByRole('button', { name: 'Next' }))

      await waitFor(() => expect(ordersApi.listSummary).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })))
    })
  })

  describe('row expansion', () => {
    it('lazily fetches and shows order detail only once a row is expanded', async () => {
      const user = userEvent.setup()
      vi.mocked(ordersApi.listSummary).mockResolvedValue(paginated([orderWith({ id: 'order-1', total: 5000 })]))
      vi.mocked(ordersApi.get).mockResolvedValue({
        id: 'order-1',
        total: 5000,
        notes: 'No onions',
        items: [{ id: 'item-1', itemName: 'Burger', quantity: 2, amount: 4000, notes: null }],
        payments: [],
      } as unknown as Order)

      renderPage()
      await waitFor(() => expect(within(desktopTable()).getByText('#ORDER-1')).toBeInTheDocument())
      const row = within(desktopTable()).getByText('#ORDER-1').closest('tr')!
      expect(ordersApi.get).not.toHaveBeenCalled()

      await user.click(row)

      await waitFor(() => expect(ordersApi.get).toHaveBeenCalledWith('order-1'))
      expect(await screen.findAllByText(/Burger/)).not.toHaveLength(0)
      expect(screen.getAllByText('Note: No onions').length).toBeGreaterThan(0)
    })
  })

  describe('cashier awaiting-payment queue', () => {
    it('shows the Awaiting Payment quick filter only for cashiers with unpaid closed orders', async () => {
      setCurrentUser(['CASHIER'])
      vi.mocked(ordersApi.listSummary).mockImplementation((filter) => {
        if (filter?.status === 'CLOSED_UNPAID' && filter?.limit === 1) {
          return Promise.resolve(paginated([orderWith({ id: 'unpaid-1' })], { total: 3 }))
        }
        return Promise.resolve(paginated([]))
      })

      renderPage()

      expect(await screen.findByRole('button', { name: 'Awaiting Payment (3)' })).toBeInTheDocument()
    })

    it('does not show the quick filter for a non-cashier', async () => {
      setCurrentUser(['WAITER'])
      vi.mocked(ordersApi.listSummary).mockResolvedValue(paginated([]))

      renderPage()

      await waitFor(() => expect(ordersApi.listSummary).toHaveBeenCalled())
      expect(screen.queryByRole('button', { name: /Awaiting Payment/ })).not.toBeInTheDocument()
    })
  })
})
