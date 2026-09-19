import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OrderTakingPage } from './OrderTakingPage'
import {
  menuCategoriesApi,
  menuItemsApi,
  ordersApi,
  customersApi,
  tablesApi,
  usersApi,
  organizationsApi,
  orderTypesApi,
} from '@/api'

vi.mock('@/api', () => ({
  menuCategoriesApi: { list: vi.fn() },
  menuItemsApi: { list: vi.fn() },
  ordersApi: { create: vi.fn() },
  customersApi: { list: vi.fn(), create: vi.fn() },
  tablesApi: { list: vi.fn(), create: vi.fn() },
  usersApi: { directory: vi.fn() },
  organizationsApi: { getCurrent: vi.fn() },
  orderTypesApi: { list: vi.fn() },
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}))

vi.mock('@/lib/printBill', () => ({
  printBill: vi.fn(),
}))

const mockUseAuthStore = vi.fn()
vi.mock('@/stores/auth', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => mockUseAuthStore(selector),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

const ORG = {
  id: 'org-1',
  name: 'Acme Diner',
  email: 'acme@acme.com',
  phone: '123',
  address: '1 Main St',
  currency: 'NGN',
  vatEnabled: false,
  taxRate: 0,
  entertainmentTaxEnabled: false,
  entertainmentTaxRate: 0,
  serviceChargeEnabled: false,
  serviceChargeRate: 0,
  receiptBankName: null,
  receiptBankAccountNumber: null,
  receiptBankAccountName: null,
}

const DINE_IN = { id: 'ot-1', name: 'Dine In', sortOrder: 0, requiresTable: true }
const TAKEAWAY = { id: 'ot-2', name: 'Takeaway', sortOrder: 1, requiresTable: false }

const BURGER = { id: 'item-1', name: 'Burger', price: 2500, isAvailable: true, categories: [{ id: 'cat-1' }] }
const FRIES = { id: 'item-2', name: 'Fries', price: 1000, isAvailable: true, categories: [{ id: 'cat-2' }] }

function setDefaultMocks() {
  vi.mocked(organizationsApi.getCurrent).mockResolvedValue(ORG as never)
  vi.mocked(tablesApi.list).mockResolvedValue([])
  vi.mocked(orderTypesApi.list).mockResolvedValue([TAKEAWAY] as never) // no table required by default
  vi.mocked(menuCategoriesApi.list).mockResolvedValue([])
  vi.mocked(menuItemsApi.list).mockResolvedValue([BURGER, FRIES] as never)
  vi.mocked(customersApi.list).mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 100, totalPages: 1 } } as never)
  vi.mocked(usersApi.directory).mockResolvedValue([])
}

function renderPage(initialEntries: string[] = ['/pos/order-taking']) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <OrderTakingPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('OrderTakingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    setDefaultMocks()
    mockUseAuthStore.mockImplementation((selector: (state: unknown) => unknown) =>
      selector({ user: { id: 'u1', organizationId: 'org-1', roles: ['CASHIER'] } }),
    )
  })

  it('renders available menu items', async () => {
    renderPage()
    expect(await screen.findByText('Burger')).toBeInTheDocument()
    expect(screen.getByText('Fries')).toBeInTheDocument()
  })

  it('adds an item to the cart and shows it in the order summary', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByText('Burger'))

    expect(screen.queryByText('No items added yet')).not.toBeInTheDocument()
    expect(screen.getAllByText('Burger')).toHaveLength(2) // menu grid + cart line
    // ₦2,500 appears 3 times here: the menu grid card, the cart line's unit price, and the
    // (untaxed, single-item) Total.
    expect(screen.getAllByText('₦2,500')).toHaveLength(3)
  })

  it('increments and decrements quantity, removing the line at zero', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByText('Burger'))

    // The minus/plus buttons are icon-only with no accessible name — find them via the
    // quantity span's sibling container (span sits between the two buttons in the DOM).
    const getButtons = () => screen.getByText('1', { selector: 'span' }).parentElement!.querySelectorAll('button')

    await user.click(getButtons()[1]) // +
    expect(screen.getByText('2')).toBeInTheDocument()

    await user.click(screen.getByText('2', { selector: 'span' }).parentElement!.querySelectorAll('button')[0]) // -
    expect(screen.getByText('1')).toBeInTheDocument()

    await user.click(screen.getByText('1', { selector: 'span' }).parentElement!.querySelectorAll('button')[0]) // - again, to 0
    expect(screen.getByText('No items added yet')).toBeInTheDocument()
  })

  it('filters the menu grid by search text', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Burger')

    await user.type(screen.getByPlaceholderText('Search menu items...'), 'fries')

    expect(screen.queryByText('Burger')).not.toBeInTheDocument()
    expect(screen.getByText('Fries')).toBeInTheDocument()
  })

  it('computes VAT and total when the organization has VAT enabled', async () => {
    vi.mocked(organizationsApi.getCurrent).mockResolvedValue({ ...ORG, vatEnabled: true, taxRate: 10 } as never)
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByText('Burger')) // 2500

    await waitFor(() => expect(screen.getByText('VAT (10%)')).toBeInTheDocument())
    expect(screen.getByText('₦250')).toBeInTheDocument() // 10% of 2500
    expect(screen.getByText('₦2,750')).toBeInTheDocument() // total
  })

  describe('order type requiring a table', () => {
    beforeEach(() => {
      vi.mocked(orderTypesApi.list).mockResolvedValue([DINE_IN, TAKEAWAY] as never)
    })

    it('shows the order type picker and disables Send Order until a table is picked', async () => {
      const user = userEvent.setup()
      renderPage()

      expect(await screen.findByRole('button', { name: 'Dine In' })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Dine In' }))
      await user.click(await screen.findByText('Burger'))

      expect(screen.getByRole('button', { name: 'Send Order' })).toBeDisabled()
    })

    it('enables Send Order once a table is attached via the assignments sheet', async () => {
      vi.mocked(tablesApi.list).mockResolvedValue([
        { id: 't1', name: 'Table 5', capacity: 4, status: 'AVAILABLE', isActive: true, sortOrder: 0 },
      ] as never)
      const user = userEvent.setup()
      renderPage()

      await user.click(await screen.findByRole('button', { name: 'Dine In' }))
      await user.click(await screen.findByText('Burger'))
      await user.click(screen.getByText('Table, Customer, Waiter & Notes'))

      await user.click(await screen.findByText('Attach a table'))
      await user.click(await screen.findByText('Table 5'))

      expect(screen.getByRole('button', { name: 'Send Order' })).not.toBeDisabled()
    })

    it('does not show the table picker when a tableId is already in the URL', async () => {
      renderPage(['/pos/order-taking?tableId=t1&source=Dine In'])
      await screen.findByText('Burger')
      expect(screen.queryByRole('button', { name: 'Dine In' })).not.toBeInTheDocument()
      expect(screen.getByText('Customer, Waiter & Notes')).toBeInTheDocument()
    })
  })

  describe('submitting an order', () => {
    it('creates the order and navigates to it on success', async () => {
      const user = userEvent.setup()
      vi.mocked(ordersApi.create).mockResolvedValue({ id: 'order-1' } as never)
      renderPage()

      await user.click(await screen.findByText('Burger'))
      await user.click(screen.getByRole('button', { name: 'Send Order' }))

      await waitFor(() =>
        expect(ordersApi.create).toHaveBeenCalledWith(
          expect.objectContaining({ items: [{ menuItemId: 'item-1', quantity: 1, notes: undefined }] }),
        ),
      )
      expect(mockNavigate).toHaveBeenCalledWith('/pos/orders/order-1')
    })

    it('navigates to the local order id when the order was queued offline', async () => {
      const user = userEvent.setup()
      vi.mocked(ordersApi.create).mockResolvedValue({ __offlinePending: true, localOrderId: 'local-1' } as never)
      renderPage()

      await user.click(await screen.findByText('Burger'))
      await user.click(screen.getByRole('button', { name: 'Send Order' }))

      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/pos/orders/local-1'))
    })
  })

  describe('draft persistence', () => {
    it('restores a cart left in localStorage and announces it', async () => {
      localStorage.setItem(
        'pos-draft:org-1:new',
        JSON.stringify({ cart: [{ menuItemId: 'item-1', name: 'Burger', price: 2500, quantity: 3 }] }),
      )
      renderPage()

      await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument())
      const { toast } = await import('sonner')
      expect(toast.message).toHaveBeenCalledWith('Restored your unsent order')
    })

    it('persists the cart to localStorage as items are added', async () => {
      const user = userEvent.setup()
      renderPage()
      await user.click(await screen.findByText('Burger'))

      await waitFor(() => {
        const raw = localStorage.getItem('pos-draft:org-1:new')
        expect(raw).toBeTruthy()
        expect(JSON.parse(raw!).cart).toHaveLength(1)
      })
    })

    it('clears the persisted draft once the order is sent', async () => {
      const user = userEvent.setup()
      vi.mocked(ordersApi.create).mockResolvedValue({ id: 'order-1' } as never)
      renderPage()
      await user.click(await screen.findByText('Burger'))
      await user.click(screen.getByRole('button', { name: 'Send Order' }))

      await waitFor(() => expect(localStorage.getItem('pos-draft:org-1:new')).toBeNull())
    })
  })

  describe('creating a customer inline', () => {
    it('adds a new customer and attaches it to the order', async () => {
      const user = userEvent.setup()
      vi.mocked(customersApi.create).mockResolvedValue({ id: 'cust-1', name: 'Ada Lovelace', phone: null } as never)
      renderPage()

      await user.click(await screen.findByText('Burger'))
      await user.click(screen.getByText('Customer, Waiter & Notes'))
      await user.click(await screen.findByText('New', { selector: 'button' }))

      await user.type(screen.getByPlaceholderText('e.g. Tunde Bakare'), 'Ada Lovelace')
      await user.click(screen.getByRole('button', { name: 'Add Customer' }))

      await waitFor(() =>
        expect(customersApi.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ada Lovelace' })),
      )
    })
  })

  it('prints a preview receipt without sending the order', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByText('Burger'))

    await user.click(screen.getByRole('button', { name: 'Print' }))

    const { printBill } = await import('@/lib/printBill')
    await waitFor(() => expect(printBill).toHaveBeenCalled())
    expect(ordersApi.create).not.toHaveBeenCalled()
  })
})
