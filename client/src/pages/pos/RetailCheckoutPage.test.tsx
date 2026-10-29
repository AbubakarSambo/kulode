import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { toast } from 'sonner'
import { RetailCheckoutPage } from './RetailCheckoutPage'
import { inventoryApi, paymentTypesApi } from '@/api'
import type { InventoryItem } from '@/types'

vi.mock('@/api', () => ({
  inventoryApi: { list: vi.fn(), lookupByBarcode: vi.fn() },
  ordersApi: { create: vi.fn(), close: vi.fn(), getReceiptData: vi.fn() },
  paymentTypesApi: { list: vi.fn() },
}))

vi.mock('@/lib/printBill', () => ({ printBill: vi.fn() }))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
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
