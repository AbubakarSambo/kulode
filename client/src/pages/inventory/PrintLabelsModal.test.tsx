import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PrintLabelsModal } from './PrintLabelsModal'
import { inventoryApi } from '@/api/inventory'
import { printLabels } from '@/lib/printLabels'
import type { InventoryItem } from '@/types'

vi.mock('@/api/inventory', () => ({ inventoryApi: { assignBarcodes: vi.fn() } }))
vi.mock('@/lib/printLabels', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/printLabels')>()),
  printLabels: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const item = (overrides: Partial<InventoryItem>) =>
  ({ id: 'i1', name: 'Item', barcode: undefined, sellPrice: 1000, onHandQuantity: 3, ...overrides }) as InventoryItem

const items = [
  item({ id: 'boubou', name: 'Kathrine boubou', barcode: '0264', sellPrice: 160500, onHandQuantity: 2 }),
  item({ id: 'zoey', name: 'Zoey Dress', barcode: '133890', sellPrice: 131500, onHandQuantity: 4 }),
  item({ id: 'gown', name: 'New Gown', barcode: undefined, onHandQuantity: 20 }),
]

function renderModal(canAssignCodes = true) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <PrintLabelsModal isOpen onClose={() => {}} items={items} canAssignCodes={canAssignCodes} />
    </QueryClientProvider>,
  )
}

describe('PrintLabelsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('prints the chosen number of labels for each item, with the header', async () => {
    const user = userEvent.setup()
    renderModal()

    await user.type(screen.getByLabelText('Label header'), 'DZYN')
    const boubou = screen.getByLabelText('Labels for Kathrine boubou')
    await user.clear(boubou)
    await user.type(boubou, '3')
    await user.click(screen.getByRole('button', { name: 'Print 3 labels' }))

    expect(printLabels).toHaveBeenCalledWith(
      [{ item: { name: 'Kathrine boubou', barcode: '0264', sellPrice: 160500 }, copies: 3 }],
      { header: 'DZYN' },
    )
  })

  it('fills quantities from stock on hand, skipping items with no barcode', async () => {
    const user = userEvent.setup()
    renderModal()

    await user.click(screen.getByRole('button', { name: 'Fill with stock' }))

    expect(screen.getByRole('button', { name: 'Print 6 labels' })).toBeInTheDocument()
    expect(screen.getByLabelText('Labels for New Gown')).toBeDisabled()
  })

  it('lets an admin assign codes to items without one', async () => {
    vi.mocked(inventoryApi.assignBarcodes).mockResolvedValue([])
    const user = userEvent.setup()
    renderModal()

    expect(screen.getByText(/1 item has no barcode/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Assign codes' }))

    expect(inventoryApi.assignBarcodes).toHaveBeenCalledWith()
  })

  it('tells non-admins to ask an admin instead', () => {
    renderModal(false)

    expect(screen.queryByRole('button', { name: 'Assign codes' })).not.toBeInTheDocument()
    expect(screen.getByText('Ask an admin to assign codes.')).toBeInTheDocument()
  })
})
