import { toast } from 'sonner'
import { ordersApi } from '@/api/orders'
import type { BillPrintResult, ReceiptData } from '@/api/orders'
import { printBill } from '@/lib/printBill'

// Two ways a bill reaches paper. If a printer in Settings > Printers is set to print bills, the
// bill goes to it through the on-site print agent — the same route kitchen dockets take, so it
// works from any phone or tablet and needs no printer installed on the device. Otherwise (or when
// the agent is offline) it falls back to the browser's own print dialog, which only lists
// printers installed on that one computer.

function announce(result: BillPrintResult): boolean {
  if (result.queued) {
    toast.success(`Bill sent to ${result.printers.join(', ')}`)
    return true
  }
  if (result.agentOffline) {
    toast.warning('The print agent is offline', {
      description: `Couldn't reach ${result.printers.join(', ')}. Printing from this device instead.`,
    })
  }
  return false
}

/** Prints the bill (or, once paid, the receipt) for an order that exists on the server. */
export async function printOrderBill(orderId: string): Promise<void> {
  try {
    if (announce(await ordersApi.printBill(orderId))) return
  } catch {
    // Asking for the bill printer must never be the reason a bill doesn't print — on any
    // failure, carry on exactly as before there was such a thing.
  }
  printBill(await ordersApi.getReceiptData(orderId))
}

/** Prints a bill built on screen for an order that hasn't been placed yet. */
export async function printBillPreview(receipt: ReceiptData): Promise<void> {
  try {
    const result = await ordersApi.printBillPreview({
      source: receipt.source,
      tableName: receipt.table?.name,
      customerName: receipt.customer?.name,
      customerPhone: receipt.customer?.phone ?? undefined,
      waiterName: receipt.waiter ? `${receipt.waiter.firstName} ${receipt.waiter.lastName}`.trim() : undefined,
      items: receipt.items.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        notes: i.notes || undefined,
      })),
      subtotal: receipt.subtotal,
      total: receipt.total,
      ...(receipt.vatApplied && { vatRate: receipt.vatRate, vatAmount: receipt.vatAmount }),
      ...(receipt.entertainmentTaxApplied && {
        entertainmentTaxRate: receipt.entertainmentTaxRate,
        entertainmentTaxAmount: receipt.entertainmentTaxAmount,
      }),
      ...(receipt.serviceChargeApplied && {
        serviceChargeRate: receipt.serviceChargeRate,
        serviceChargeAmount: receipt.serviceChargeAmount,
      }),
    })
    if (announce(result)) return
  } catch {
    // The preview is built entirely on this device, so it can still print without the server.
  }
  printBill(receipt)
}
