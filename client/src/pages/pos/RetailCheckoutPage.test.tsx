import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { toast } from 'sonner'
import { RetailCheckoutPage } from './RetailCheckoutPage'
import { customersApi, heldSalesApi, inventoryApi, ordersApi, organizationsApi, paymentTypesApi } from '@/api'
import type { Customer, InventoryItem } from '@/types'

vi.mock('@/api', () => ({
  inventoryApi: { list: vi.fn(), lookupByBarcode: vi.fn() },
  ordersApi: { create: vi.fn(), close: vi.fn(), getReceiptData: vi.fn() },
  paymentTypesApi: { list: vi.fn() },
  customersApi: { list: vi.fn(), get: vi.fn() },
  heldSalesApi: { list: vi.fn().mockResolvedValue([]), hold: vi.fn(), recall: vi.fn(), discard: vi.fn() },
  organizationsApi: { getCurrent: vi.fn() },
}))

vi.mock('@/lib/sendBill', () => ({ printOrderBill: vi.fn() }))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

function item(overrides: Partial<InventoryItem>): InventoryItem {
  return {
    id: 'item-1',
    name: 'Item',
    unitPrice: 100,
    onHandQuantity: 10,
    reservedQuantity: 0,
    availableQuantity: 10,
    reorderLevel: 0,
    unitOfMeasure: 'PIECE',
    isActive: true,
    sellPrice: 500,
    vatCategory: 'STANDARD',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  } as InventoryItem
}

const catalog = [
  item({ id: 'milk', name: 'Peak Milk 400g', barcode: '6151100000011', sellPrice: 2500 }),
  item({ id: 'milo', name: 'Milo Refill 500g', barcode: '6151100000028', sellPrice: 3200 }),
  item({ id: 'rice', name: 'Mama Gold Rice 5kg', barcode: '6151100000035', sellPrice: 9000 }),
]

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RetailCheckoutPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('RetailCheckoutPage search', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(inventoryApi.list).mockResolvedValue(catalog)
    vi.mocked(paymentTypesApi.list).mockResolvedValue([])
    vi.mocked(inventoryApi.lookupByBarcode).mockRejectedValue(new Error('404'))
    vi.mocked(organizationsApi.getCurrent).mockResolvedValue({} as never)
  })

  it('suggests catalog items by name as you type and adds one on click', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(inventoryApi.list).toHaveBeenCalled())

    await user.type(screen.getByLabelText('Scan barcode or search'), 'mil')

    expect(await screen.findByRole('option', { name: /Peak Milk 400g/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Milo Refill 500g/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Rice/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('option', { name: /Milo Refill 500g/ }))

    expect(screen.getByText('Milo Refill 500g')).toBeInTheDocument()
    expect(screen.getByLabelText('Scan barcode or search')).toHaveValue('')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('adds the arrow-key highlighted suggestion on Enter without a barcode lookup', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(inventoryApi.list).toHaveBeenCalled())

    await user.type(screen.getByLabelText('Scan barcode or search'), 'mil{ArrowDown}{ArrowDown}{Enter}')

    expect(screen.getByText('Milo Refill 500g')).toBeInTheDocument()
    expect(inventoryApi.lookupByBarcode).not.toHaveBeenCalled()
  })

  it('still sends a scanned code to the barcode lookup on Enter', async () => {
    const user = userEvent.setup()
    vi.mocked(inventoryApi.lookupByBarcode).mockResolvedValue(catalog[2])
    renderPage()
    await waitFor(() => expect(inventoryApi.list).toHaveBeenCalled())

    await user.type(screen.getByLabelText('Scan barcode or search'), '6151100000035{Enter}')

    await waitFor(() => expect(inventoryApi.lookupByBarcode).toHaveBeenCalledWith('6151100000035'))
    expect(await screen.findByText('Mama Gold Rice 5kg')).toBeInTheDocument()
  })

  it('falls back to the single name match when the typed text is not a barcode', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(inventoryApi.list).toHaveBeenCalled())

    await user.type(screen.getByLabelText('Scan barcode or search'), 'rice{Enter}')

    expect(await screen.findByText('Mama Gold Rice 5kg')).toBeInTheDocument()
  })

  it('asks the cashier to pick when several items match and nothing is highlighted', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(inventoryApi.list).toHaveBeenCalled())

    await user.type(screen.getByLabelText('Scan barcode or search'), 'mil{Enter}')

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Several items match "mil" — pick one from the list'))
    expect(screen.getByLabelText('Scan barcode or search')).toHaveValue('mil')
    expect(screen.getByRole('option', { name: /Peak Milk 400g/ })).toBeInTheDocument()
  })
})

function customer(overrides: Partial<Customer>): Customer {
  return { id: 'c1', name: 'Ada Obi', phone: '08010000000', isActive: true, walletBalance: 10000, creditLimit: 0, createdAt: '', ...overrides }
}

describe('RetailCheckoutPage wallet payment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(inventoryApi.list).mockResolvedValue(catalog)
    vi.mocked(paymentTypesApi.list).mockResolvedValue([{ id: 'pt-cash', name: 'Cash', sortOrder: 0 } as never])
    vi.mocked(inventoryApi.lookupByBarcode).mockRejectedValue(new Error('404'))
    vi.mocked(organizationsApi.getCurrent).mockResolvedValue({} as never)
    vi.mocked(customersApi.list).mockResolvedValue({
      data: [customer({}), customer({ id: 'c2', name: 'Bayo Ade', phone: undefined, walletBalance: 1000, creditLimit: 500 })],
      meta: { total: 2, page: 1, limit: 100, totalPages: 1 },
    } as never)
    vi.mocked(ordersApi.create).mockResolvedValue({ id: 'order-1' } as never)
    vi.mocked(ordersApi.close).mockResolvedValue({ id: 'order-1' } as never)
    vi.mocked(ordersApi.getReceiptData).mockResolvedValue({} as never)
  })

  async function addMilkAndChooseWallet(user: ReturnType<typeof userEvent.setup>) {
    renderPage()
    await waitFor(() => expect(inventoryApi.list).toHaveBeenCalled())
    await user.type(screen.getByLabelText('Scan barcode or search'), 'peak')
    await user.click(await screen.findByRole('option', { name: /Peak Milk 400g/ }))
    await user.click(screen.getByRole('button', { name: 'Customer Wallet' }))
  }

  it("charges the sale to the picked customer's wallet", async () => {
    const user = userEvent.setup()
    await addMilkAndChooseWallet(user)

    const charge = screen.getByRole('button', { name: /Charge/ })
    expect(charge).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Search by name or phone' }))
    await user.click(await screen.findByRole('button', { name: 'Ada Obi (08010000000)' }))

    expect(screen.getByText('₦10,000')).toBeInTheDocument()
    expect(screen.getByText('₦7,500')).toBeInTheDocument()

    await user.click(charge)

    await waitFor(() => expect(ordersApi.close).toHaveBeenCalledWith('order-1', { paymentMethod: 'WALLET' }))
    expect(ordersApi.create).toHaveBeenCalledWith(expect.objectContaining({ source: 'Retail Sale', customerId: 'c1' }))
    // Next sale starts back on the default tender, not this wallet
    expect(screen.queryByText('Ada Obi')).not.toBeInTheDocument()
  })

  it("won't charge past the customer's credit limit", async () => {
    const user = userEvent.setup()
    await addMilkAndChooseWallet(user)

    await user.click(screen.getByRole('button', { name: 'Search by name or phone' }))
    await user.click(await screen.findByRole('button', { name: 'Bayo Ade' }))

    expect(screen.getByText(/exceeds the customer's approved credit limit/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Charge/ })).toBeDisabled()
  })

  it('leaves other tenders without a customer on the sale', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(inventoryApi.list).toHaveBeenCalled())
    await user.type(screen.getByLabelText('Scan barcode or search'), 'peak')
    await user.click(await screen.findByRole('option', { name: /Peak Milk 400g/ }))
    await user.click(screen.getByRole('button', { name: /Charge/ }))

    await waitFor(() => expect(ordersApi.close).toHaveBeenCalledWith('order-1', { paymentMethod: 'Cash' }))
    expect(vi.mocked(ordersApi.create).mock.calls[0][0]).not.toHaveProperty('customerId')
  })

  it('disables Customer Wallet while offline', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    renderPage()
    expect(await screen.findByRole('button', { name: 'Customer Wallet' })).toBeDisabled()
    expect(screen.getByText(/unavailable offline/)).toBeInTheDocument()
    onLine.mockRestore()
  })
})

describe('RetailCheckoutPage tax', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(inventoryApi.list).mockResolvedValue(catalog)
    vi.mocked(paymentTypesApi.list).mockResolvedValue([{ id: 'pt-cash', name: 'Cash', sortOrder: 0 } as never])
    vi.mocked(inventoryApi.lookupByBarcode).mockRejectedValue(new Error('404'))
    vi.mocked(organizationsApi.getCurrent).mockResolvedValue({ vatEnabled: true, taxRate: '7.5' } as never)
    vi.mocked(customersApi.list).mockResolvedValue({
      data: [customer({ walletBalance: 10000 })],
      meta: { total: 1, page: 1, limit: 100, totalPages: 1 },
    } as never)
  })

  it('shows and charges the total including VAT, the same total the order will have', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(organizationsApi.getCurrent).toHaveBeenCalled())
    await user.type(screen.getByLabelText('Scan barcode or search'), 'peak')
    await user.click(await screen.findByRole('option', { name: /Peak Milk 400g/ }))

    // 2,500 + 7.5% VAT (187.50)
    expect(await screen.findByText('VAT (7.5%)')).toBeInTheDocument()
    expect(screen.getByText('₦187.5')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Charge ₦2,687.5' })).toBeInTheDocument()
  })

  it("previews the wallet balance after the VAT-inclusive total", async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(organizationsApi.getCurrent).toHaveBeenCalled())
    await user.type(screen.getByLabelText('Scan barcode or search'), 'peak')
    await user.click(await screen.findByRole('option', { name: /Peak Milk 400g/ }))
    await user.click(screen.getByRole('button', { name: 'Customer Wallet' }))
    await user.click(screen.getByRole('button', { name: 'Search by name or phone' }))
    await user.click(await screen.findByRole('button', { name: 'Ada Obi (08010000000)' }))

    expect(screen.getByText('₦7,312.5')).toBeInTheDocument()
  })
})


describe('RetailCheckoutPage hold and recall', () => {
  const heldRow = {
    id: 'held-1',
    label: null,
    createdAt: '2026-11-14T10:00:00Z',
    heldByName: 'Ada Obi',
    preview: ['Mama Gold Rice 5kg'],
    itemCount: 1,
    total: 9000,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(inventoryApi.list).mockResolvedValue(catalog)
    vi.mocked(paymentTypesApi.list).mockResolvedValue([])
    vi.mocked(organizationsApi.getCurrent).mockResolvedValue({} as never)
    vi.mocked(heldSalesApi.list).mockResolvedValue([])
  })

  async function addMilk(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText('Scan barcode or search'), 'peak')
    await user.click(await screen.findByRole('option', { name: /Peak Milk 400g/ }))
  }

  it('parks the cart on the server and clears the till for the next customer', async () => {
    const user = userEvent.setup()
    vi.mocked(heldSalesApi.hold).mockResolvedValue({ id: 'held-1' })
    renderPage()
    await waitFor(() => expect(heldSalesApi.list).toHaveBeenCalled())
    await addMilk(user)

    await user.click(screen.getByRole('button', { name: /Hold sale/ }))

    await waitFor(() =>
      expect(heldSalesApi.hold).toHaveBeenCalledWith({ items: [{ inventoryItemId: 'milk', quantity: 1 }] }),
    )
    expect(await screen.findByText(/Cart is empty/)).toBeInTheDocument()
  })

  it("won't hold an empty cart", async () => {
    renderPage()
    await waitFor(() => expect(heldSalesApi.list).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: /Hold sale/ })).toBeDisabled()
  })

  it("shows carts held at other lanes and loads one back into the cart", async () => {
    const user = userEvent.setup()
    vi.mocked(heldSalesApi.list).mockResolvedValue([heldRow])
    vi.mocked(heldSalesApi.recall).mockResolvedValue({
      id: 'held-1',
      label: null,
      customerId: null,
      lines: [
        { inventoryItemId: 'rice', name: 'Mama Gold Rice 5kg', quantity: 1, unitPrice: 9000, heldUnitPrice: 9000, priceChanged: false, unavailable: false },
      ],
    })
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Held (1)' }))
    expect(screen.getByText(/held by Ada Obi/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Recall' }))

    await waitFor(() => expect(heldSalesApi.recall).toHaveBeenCalledWith('held-1'))
    expect(await screen.findByRole('button', { name: 'Charge ₦9,000' })).toBeInTheDocument()
  })

  it('refuses to recall over a sale already in progress', async () => {
    const user = userEvent.setup()
    vi.mocked(heldSalesApi.list).mockResolvedValue([heldRow])
    renderPage()
    await addMilk(user)
    await user.click(await screen.findByRole('button', { name: 'Held (1)' }))

    await user.click(screen.getByRole('button', { name: 'Recall' }))

    expect(heldSalesApi.recall).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Finish or hold the current sale before recalling another')
  })

  it('warns about repriced lines and drops ones that can no longer be sold', async () => {
    const user = userEvent.setup()
    vi.mocked(heldSalesApi.list).mockResolvedValue([heldRow])
    vi.mocked(heldSalesApi.recall).mockResolvedValue({
      id: 'held-1',
      label: null,
      customerId: null,
      lines: [
        { inventoryItemId: 'milk', name: 'Peak Milk 400g', quantity: 1, unitPrice: 2600, heldUnitPrice: 2500, priceChanged: true, unavailable: false },
        { inventoryItemId: 'rice', name: 'Mama Gold Rice 5kg', quantity: 1, unitPrice: 9000, heldUnitPrice: 9000, priceChanged: false, unavailable: true },
      ],
    })
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Held (1)' }))
    await user.click(screen.getByRole('button', { name: 'Recall' }))

    await waitFor(() => expect(toast.warning).toHaveBeenCalled())
    expect(vi.mocked(toast.warning).mock.calls[0][0]).toContain('Peak Milk 400g')
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('left out: Mama Gold Rice 5kg'))
    expect(screen.queryByText('Mama Gold Rice 5kg')).not.toBeInTheDocument()
  })

  it('reports a sale another lane already picked up and refreshes the list', async () => {
    const user = userEvent.setup()
    vi.mocked(heldSalesApi.list).mockResolvedValue([heldRow])
    vi.mocked(heldSalesApi.recall).mockRejectedValue({
      response: { data: { message: 'This sale has already been picked up at another till' } },
    })
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Held (1)' }))
    await user.click(screen.getByRole('button', { name: 'Recall' }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('This sale has already been picked up at another till'),
    )
    expect(vi.mocked(heldSalesApi.list).mock.calls.length).toBeGreaterThan(1)
  })
})
