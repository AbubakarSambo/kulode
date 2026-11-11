import { describe, it, expect, vi, beforeEach } from 'vitest'
import { toast } from 'sonner'
import { ordersApi } from '@/api/orders'
import type { ReceiptData } from '@/api/orders'
import { printBill } from '@/lib/printBill'
import { printOrderBill, printBillPreview } from './sendBill'

vi.mock('@/api/orders', () => ({
  ordersApi: { printBill: vi.fn(), printBillPreview: vi.fn(), getReceiptData: vi.fn() },
}))
vi.mock('@/lib/printBill', () => ({ printBill: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn() } }))

const preview = {
  source: 'Dine In',
  table: { name: 'Table 4' },
  customer: null,
  waiter: { firstName: 'Ada', lastName: 'Obi' },
  items: [{ name: 'Burger', quantity: 2, unitPrice: 5000, amount: 10000 }],
  subtotal: 10000,
  total: 10750,
  vatApplied: true,
  vatRate: 7.5,
  vatAmount: 750,
  entertainmentTaxApplied: false,
  serviceChargeApplied: false,
} as unknown as ReceiptData

describe('printOrderBill', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sends the bill to the bill printer and leaves the browser print window closed', async () => {
    vi.mocked(ordersApi.printBill).mockResolvedValue({ queued: true, printers: ['Front Desk'], jobIds: ['j1'] })

    await printOrderBill('order-1')

    expect(toast.success).toHaveBeenCalledWith('Bill sent to Front Desk')
    expect(printBill).not.toHaveBeenCalled()
  })

  it('prints through the browser when no printer is set to print bills', async () => {
    vi.mocked(ordersApi.printBill).mockResolvedValue({ queued: false, printers: [], jobIds: [] })
    vi.mocked(ordersApi.getReceiptData).mockResolvedValue(preview)

    await printOrderBill('order-1')

    expect(printBill).toHaveBeenCalledWith(preview)
    expect(toast.warning).not.toHaveBeenCalled()
  })

  it('says the agent is offline and prints through the browser instead', async () => {
    vi.mocked(ordersApi.printBill).mockResolvedValue({ queued: false, agentOffline: true, printers: ['Front Desk'], jobIds: [] })
    vi.mocked(ordersApi.getReceiptData).mockResolvedValue(preview)

    await printOrderBill('order-1')

    expect(toast.warning).toHaveBeenCalled()
    expect(printBill).toHaveBeenCalledWith(preview)
  })

  it('prints through the browser when asking for the bill printer fails', async () => {
    vi.mocked(ordersApi.printBill).mockRejectedValue(new Error('Request failed with status code 404'))
    vi.mocked(ordersApi.getReceiptData).mockResolvedValue(preview)

    await printOrderBill('order-1')

    expect(printBill).toHaveBeenCalledWith(preview)
  })
})

describe('printBillPreview', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sends only the taxes that apply', async () => {
    vi.mocked(ordersApi.printBillPreview).mockResolvedValue({ queued: true, printers: ['Front Desk'], jobIds: ['j1'] })

    await printBillPreview(preview)

    expect(ordersApi.printBillPreview).toHaveBeenCalledWith({
      source: 'Dine In',
      tableName: 'Table 4',
      customerName: undefined,
      customerPhone: undefined,
      waiterName: 'Ada Obi',
      items: [{ name: 'Burger', quantity: 2, unitPrice: 5000, notes: undefined }],
      subtotal: 10000,
      total: 10750,
      vatRate: 7.5,
      vatAmount: 750,
    })
    expect(printBill).not.toHaveBeenCalled()
  })

  it('still prints through the browser when the server cannot be reached', async () => {
    vi.mocked(ordersApi.printBillPreview).mockRejectedValue(new Error('Network Error'))

    await printBillPreview(preview)

    expect(printBill).toHaveBeenCalledWith(preview)
  })
})
