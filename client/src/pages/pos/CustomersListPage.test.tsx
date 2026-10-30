import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CustomersListPage } from './CustomersListPage'
import { customersApi } from '@/api'
import type { Customer } from '@/types'

vi.mock('@/api', () => ({
  customersApi: { list: vi.fn(), getWalletSummary: vi.fn(), create: vi.fn() },
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

function customer(overrides: Partial<Customer>): Customer {
  return {
    id: 'c1',
    name: 'Tunde Bakare',
    isActive: true,
    walletBalance: 0,
    creditLimit: 0,
    createdAt: new Date('2026-01-15T12:00:00Z').toISOString(),
    _count: { orders: 3 },
    ...overrides,
  }
}

function paginated(data: Customer[]) {
  return { data, meta: { total: data.length, page: 1, limit: 100, totalPages: 1 } }
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CustomersListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('CustomersListPage wallet debt', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(customersApi.getWalletSummary).mockResolvedValue({ owingCount: 2, totalOwed: 75000, overLimitCount: 1 })
  })

  it('shows each wallet balance — debt against the credit limit, over-limit debt, and prepaid credit', async () => {
    // Balances come over the wire as Decimal strings
    vi.mocked(customersApi.list).mockResolvedValue(
      paginated([
        customer({ id: 'a', name: 'Within Limit', walletBalance: '-20000' as unknown as number, creditLimit: '50000' as unknown as number }),
        customer({ id: 'b', name: 'Past Limit', walletBalance: -55000, creditLimit: 30000 }),
        customer({ id: 'c', name: 'Prepaid', walletBalance: 5000 }),
      ]),
    )

    renderPage()

    const table = await screen.findByRole('table')
    const inLimit = within(within(table).getByText('Within Limit').closest('tr')!)
    expect(inLimit.getByText('Owes ₦20,000')).toBeInTheDocument()
    expect(inLimit.getByText('of ₦50,000 limit')).toBeInTheDocument()

    const past = within(within(table).getByText('Past Limit').closest('tr')!)
    expect(past.getByText('Owes ₦55,000')).toBeInTheDocument()
    expect(past.getByText('Over limit of ₦30,000')).toBeInTheDocument()

    expect(within(within(table).getByText('Prepaid').closest('tr')!).getByText('₦5,000')).toBeInTheDocument()
  })

  it('summarises the debt, and the Owing filter asks the server for debtors from page 1', async () => {
    vi.mocked(customersApi.list).mockResolvedValue(paginated([customer({})]))
    const user = userEvent.setup()

    renderPage()

    expect(await screen.findByText(/2 customers owe/)).toBeInTheDocument()
    expect(screen.getByText('₦75,000')).toBeInTheDocument()
    expect(screen.getByText('1 over their credit limit')).toBeInTheDocument()
    expect(customersApi.list).toHaveBeenCalledWith(expect.objectContaining({ balance: undefined, page: 1 }))

    await user.click(screen.getByRole('button', { name: 'Owing (2)' }))

    await waitFor(() =>
      expect(customersApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ balance: 'owing', page: 1 })),
    )
  })

  it('hides the summary when nobody owes, and says so when the Owing filter is empty', async () => {
    vi.mocked(customersApi.getWalletSummary).mockResolvedValue({ owingCount: 0, totalOwed: 0, overLimitCount: 0 })
    vi.mocked(customersApi.list).mockImplementation(async (filters) =>
      paginated(filters?.balance === 'owing' ? [] : [customer({})]),
    )
    const user = userEvent.setup()

    renderPage()

    await screen.findByRole('table')
    expect(screen.queryByText(/owe/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Owing (0)' }))

    expect(await screen.findByText('Nobody owes anything')).toBeInTheDocument()
  })
})
