import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Download, CreditCard, FileText } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, CardTitle, Badge } from '@/components/ui'
import apiClient from '@/api/client'
import { formatCurrency, formatDate } from '@/lib/utils'
import { posthog } from '@/lib/posthog'
import type { InvoiceStatus } from '@/types'

interface PublicInvoiceData {
  invoiceNumber: string
  issueDate: string
  dueDate: string
  status: InvoiceStatus
  subtotal: number
  discountPercent?: number
  discountAmount?: number
  taxAmount: number
  total: number
  amountPaid: number
  notes?: string
  terms?: string
  paymentUrl?: string
  organization: {
    name: string
    email?: string
    phone?: string
    address?: string
  }
  client: {
    name: string
    email?: string
    phone?: string
    address?: string
  }
  items: Array<{
    description: string
    quantity: number
    unitPrice: number
    amount: number
  }>
}

const statusColors: Record<InvoiceStatus, 'default' | 'secondary' | 'success' | 'warning' | 'destructive'> = {
  DRAFT: 'secondary',
  SENT: 'default',
  PAID: 'success',
  PARTIALLY_PAID: 'warning',
  OVERDUE: 'destructive',
  CANCELLED: 'secondary',
}

export function PublicInvoicePage() {
  const { token } = useParams<{ token: string }>()

  const { data: invoice, isLoading, error } = useQuery({
    queryKey: ['public-invoice', token],
    queryFn: async () => {
      const response = await apiClient.get<{ data: PublicInvoiceData }>(`/invoices/public/${token}`)
      return response.data.data
    },
    enabled: !!token,
  })

  const downloadPdf = async () => {
    try {
      const response = await apiClient.get(`/invoices/public/${token}/pdf`, {
        responseType: 'blob',
      })
      
      const blob = new Blob([response.data], { type: 'application/pdf' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${invoice?.invoiceNumber || 'invoice'}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      posthog.capture('public_invoice_pdf_downloaded', { invoice_number: invoice?.invoiceNumber })
    } catch (error) {
      console.error('Failed to download PDF')
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted p-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (error || !invoice) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-muted p-4">
        <FileText className="h-16 w-16 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-semibold">Invoice Not Found</h1>
        <p className="mt-2 text-muted-foreground">
          This invoice may have been deleted or the link is invalid.
        </p>
      </div>
    )
  }

  const outstanding = invoice.total - invoice.amountPaid
  const isPaid = invoice.status === 'PAID'

  return (
    <div className="min-h-screen bg-muted p-4 md:p-8">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-primary">{invoice.organization.name}</h1>
            <p className="text-muted-foreground">Invoice {invoice.invoiceNumber}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={downloadPdf}>
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </Button>
            {invoice.paymentUrl && !isPaid && (
              <a href={invoice.paymentUrl} target="_blank" rel="noopener noreferrer" onClick={() => posthog.capture('public_invoice_pay_now_clicked', { invoice_number: invoice.invoiceNumber })}>
                <Button>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Pay Now
                </Button>
              </a>
            )}
          </div>
        </div>

        {/* Status Banner */}
        {isPaid ? (
          <div className="mb-6 rounded-lg bg-success/10 border border-success p-4 text-center">
            <p className="font-semibold text-success">This invoice has been paid in full</p>
          </div>
        ) : (
          <div className="mb-6 rounded-lg bg-primary/10 border border-primary p-4 text-center">
            <p className="text-sm text-muted-foreground">Amount Due</p>
            <p className="text-3xl font-bold text-primary">{formatCurrency(outstanding)}</p>
            <p className="mt-1 text-sm text-muted-foreground">Due {formatDate(invoice.dueDate)}</p>
          </div>
        )}

        {/* Invoice Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Invoice Details
            </CardTitle>
            <Badge variant={statusColors[invoice.status]}>
              {invoice.status.replace('_', ' ')}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Bill To & Dates */}
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Bill To</p>
                <p className="mt-1 font-medium">{invoice.client.name}</p>
                {invoice.client.email && (
                  <p className="text-sm text-muted-foreground">{invoice.client.email}</p>
                )}
                {invoice.client.phone && (
                  <p className="text-sm text-muted-foreground">{invoice.client.phone}</p>
                )}
              </div>
              <div className="space-y-2 sm:text-right">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Issue Date</p>
                  <p>{formatDate(invoice.issueDate)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Due Date</p>
                  <p>{formatDate(invoice.dueDate)}</p>
                </div>
              </div>
            </div>

            {/* Line Items */}
            <div className="border-t pt-4 overflow-x-auto">
              <table className="w-full min-w-[400px]">
                <thead>
                  <tr className="text-sm text-muted-foreground">
                    <th className="pb-2 text-left font-medium">Description</th>
                    <th className="pb-2 text-right font-medium">Qty</th>
                    <th className="pb-2 text-right font-medium">Price</th>
                    <th className="pb-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((item, index) => (
                    <tr key={index} className="border-t">
                      <td className="py-3">{item.description}</td>
                      <td className="py-3 text-right">{item.quantity}</td>
                      <td className="py-3 text-right">{formatCurrency(item.unitPrice)}</td>
                      <td className="py-3 text-right font-medium">{formatCurrency(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t">
                    <td colSpan={3} className="py-3 text-right font-medium">Subtotal</td>
                    <td className="py-3 text-right font-medium">{formatCurrency(invoice.subtotal)}</td>
                  </tr>
                  {(invoice.discountAmount || 0) > 0 && (
                    <tr className="text-success">
                      <td colSpan={3} className="py-1 text-right">Discount ({invoice.discountPercent}%)</td>
                      <td className="py-1 text-right">-{formatCurrency(invoice.discountAmount || 0)}</td>
                    </tr>
                  )}
                  {invoice.taxAmount > 0 && (
                    <tr>
                      <td colSpan={3} className="py-1 text-right text-muted-foreground">VAT (7.5%)</td>
                      <td className="py-1 text-right">{formatCurrency(invoice.taxAmount)}</td>
                    </tr>
                  )}
                  <tr className="text-lg">
                    <td colSpan={3} className="py-3 text-right font-semibold">Total</td>
                    <td className="py-3 text-right font-semibold">{formatCurrency(invoice.total)}</td>
                  </tr>
                  {invoice.amountPaid > 0 && (
                    <>
                      <tr className="text-success">
                        <td colSpan={3} className="py-1 text-right">Paid</td>
                        <td className="py-1 text-right">-{formatCurrency(invoice.amountPaid)}</td>
                      </tr>
                      <tr className="font-semibold">
                        <td colSpan={3} className="py-1 text-right">Balance Due</td>
                        <td className="py-1 text-right">{formatCurrency(outstanding)}</td>
                      </tr>
                    </>
                  )}
                </tfoot>
              </table>
            </div>

            {/* Notes */}
            {invoice.notes && (
              <div className="border-t pt-4">
                <p className="text-sm font-medium text-muted-foreground">Notes</p>
                <p className="mt-1 text-sm">{invoice.notes}</p>
              </div>
            )}

            {/* Terms */}
            {invoice.terms && (
              <div className="border-t pt-4">
                <p className="text-sm font-medium text-muted-foreground">Terms & Conditions</p>
                <p className="mt-1 text-sm">{invoice.terms}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pay Now CTA */}
        {invoice.paymentUrl && !isPaid && (
          <div className="mt-6 text-center">
            <a href={invoice.paymentUrl} target="_blank" rel="noopener noreferrer" onClick={() => posthog.capture('public_invoice_pay_now_clicked', { invoice_number: invoice.invoiceNumber })}>
              <Button size="lg" className="w-full sm:w-auto">
                <CreditCard className="mr-2 h-5 w-5" />
                Pay {formatCurrency(outstanding)} Now
              </Button>
            </a>
            <p className="mt-2 text-xs text-muted-foreground">
              Secure payment powered by Paystack
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p>Invoice from {invoice.organization.name}</p>
          {invoice.organization.email && <p>{invoice.organization.email}</p>}
        </div>
      </div>
    </div>
  )
}
