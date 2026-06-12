import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, CreditCard, FileText } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, CardTitle, Badge } from '@/components/ui'
import { RebrandBanner } from '@/components/shared'
import apiClient from '@/api/client'
import { formatCurrency, formatDate } from '@/lib/utils'
import { posthog } from '@/lib/posthog'
import { toast } from 'sonner'
import type { InvoiceStatus } from '@/types'

interface PublicInvoiceData {
  invoiceNumber: string
  issueDate: string
  dueDate: string
  status: InvoiceStatus
  subtotal: number
  discountType?: string
  discountPercent?: number
  discountAmount?: number
  taxRate?: number
  taxAmount: number
  total: number
  amountPaid: number
  notes?: string
  terms?: string
  paymentUrl?: string
  paystackAccessCode?: string
  paystackReference?: string
  paystackPublicKey?: string
  paystackSubaccountCode?: string
  organization: {
    name: string
    email?: string
    phone?: string
    address?: string
    logo?: string | null
    bankAccountNumber?: string | null
    bankAccountName?: string | null
    settlementBank?: string | null
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
  installments?: Array<{
    id: string
    label: string
    sequence: number
    percentage: number
    amount: number
    isPaid: boolean
    paystackAccessCode?: string
    paystackReference?: string
    paymentUrl?: string
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

const loadPaystackScript = (): Promise<boolean> => {
  return new Promise((resolve) => {
    if ('PaystackPop' in window) {
      resolve(true)
      return
    }
    const script = document.createElement('script')
    script.src = 'https://js.paystack.co/v2/inline.js'
    script.async = true
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

export function PublicInvoicePage() {
  const { token } = useParams<{ token: string }>()
  const queryClient = useQueryClient()
  const [isPaying, setIsPaying] = useState(false)

  const { data: invoice, isLoading, isError } = useQuery({
    queryKey: ['public-invoice', token],
    queryFn: async () => {
      const response = await apiClient.get<{ data: PublicInvoiceData }>(`/invoices/public/${token}`)
      return response.data.data
    },
    enabled: !!token,
  })

  const handlePayNow = async (accessCode?: string) => {
    if (!invoice) return
    const code = accessCode || invoice.paystackAccessCode
    setIsPaying(true)
    posthog.capture('public_invoice_pay_now_clicked', { invoice_number: invoice.invoiceNumber })

    try {
      const loaded = await loadPaystackScript()
      if (!loaded) {
        toast.error('Failed to load payment gateway. Please try again.')
        if (invoice.paymentUrl && !accessCode) {
          window.open(invoice.paymentUrl, '_blank')
        }
        return
      }

      if (!code) {
        if (invoice.paymentUrl && !accessCode) {
          window.open(invoice.paymentUrl, '_blank')
        } else {
          toast.error('Online payment is not enabled for this invoice.')
        }
        return
      }

      const paystack = new (window as unknown as {
        PaystackPop: new () => {
          resumeTransaction: (config: {
            access_code: string
            onSuccess: () => void
            onCancel: () => void
          }) => void
        }
      }).PaystackPop()
      paystack.resumeTransaction({
        access_code: code,
        onSuccess: () => {
          toast.success('Payment received! Updating invoice status...')
          queryClient.invalidateQueries({ queryKey: ['public-invoice', token] })
        },
        onCancel: () => {
          toast.info('Payment cancelled.')
        },
      })
    } catch (err) {
      console.error('Paystack checkout error:', err)
      toast.error('An error occurred during checkout. Please try again.')
    } finally {
      setIsPaying(false)
    }
  }

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

  if (isError || !invoice) {
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
  const nextUnpaidInstallment = invoice.installments?.find(inst => !inst.isPaid)

  return (
    <div className="min-h-screen bg-[#f8f9ff]">
      <RebrandBanner />
      <div className="p-4 md:p-8">
        <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0037b0] tracking-tight">{invoice.organization.name}</h1>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">Invoice {invoice.invoiceNumber}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={downloadPdf} className="h-10 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200/60 rounded-xl cursor-pointer">
              <Download className="mr-2 h-4 w-4 text-slate-500" />
              Download PDF
            </Button>
            {invoice.paymentUrl && !isPaid && (!invoice.installments || invoice.installments.length === 0) && (
              <Button onClick={() => handlePayNow()} isLoading={isPaying} className="bg-[#0037b0] hover:bg-[#1d4ed8] text-white text-xs font-bold h-10 px-4 rounded-xl cursor-pointer border-0 shadow-md">
                <CreditCard className="mr-2 h-4 w-4" />
                Pay Now
              </Button>
            )}
          </div>
        </div>

        {/* Status Banner */}
        {isPaid ? (
          <div className="mb-6 rounded-2xl bg-emerald-50 border border-emerald-100 p-5 text-center shadow-[0px_12px_32px_rgba(0,108,73,0.04)] animate-in fade-in duration-300">
            <p className="font-bold text-[#006c49] text-base">This invoice has been paid in full</p>
          </div>
        ) : (
          <div className="mb-6 rounded-2xl bg-[#eef4ff] border border-slate-200/30 p-5 text-center shadow-[0px_12px_32px_rgba(0,55,176,0.02)] animate-in fade-in duration-300">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {invoice.installments && invoice.installments.length > 0 ? 'Next Installment Due' : 'Amount Due'}
            </p>
            <p className="text-3xl font-black text-[#0037b0] tracking-tight mt-1">
              {formatCurrency(invoice.installments && invoice.installments.length > 0 && nextUnpaidInstallment ? nextUnpaidInstallment.amount : outstanding)}
            </p>
            <p className="mt-1.5 text-xs text-slate-500 font-semibold">
              {invoice.installments && invoice.installments.length > 0 && nextUnpaidInstallment 
                ? `Installment: "${nextUnpaidInstallment.label}"` 
                : `Due ${formatDate(invoice.dueDate)}`}
            </p>
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
                      <td colSpan={3} className="py-1 text-right">
                        Discount{invoice.discountType !== 'FIXED' ? ` (${invoice.discountPercent}%)` : ''}
                      </td>
                      <td className="py-1 text-right">-{formatCurrency(invoice.discountAmount || 0)}</td>
                    </tr>
                  )}
                  {invoice.taxAmount > 0 && (
                    <tr>
                      <td colSpan={3} className="py-1 text-right text-muted-foreground">VAT ({invoice.taxRate ?? 7.5}%)</td>
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

        {/* Payment Schedule Card (for split payments) */}
        {invoice.installments && invoice.installments.length > 0 && (
          <Card className="mt-6 border border-slate-200/30 shadow-[0px_12px_32px_rgba(0,55,176,0.04)] rounded-2xl overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100/60 p-4">
              <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-[#0037b0]" />
                Payment Schedule
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3 bg-white">
              <div className="space-y-2.5">
                {invoice.installments.map((inst) => (
                  <div key={inst.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl border border-slate-100 bg-[#f8f9ff]/50 gap-3 transition-all">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                        inst.isPaid 
                          ? 'bg-emerald-50 text-[#006c49] border border-emerald-100' 
                          : 'bg-[#eef4ff] text-[#0037b0] border border-blue-100'
                      }`}>
                        {inst.sequence}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800">{inst.label}</p>
                        <p className="text-[10px] text-slate-400 font-semibold mt-0.5">{inst.percentage}% of total</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end gap-4">
                      <span className="text-xs font-black text-slate-850 tabular-nums">
                        {formatCurrency(inst.amount)}
                      </span>
                      {inst.isPaid ? (
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-100 text-[#006c49] text-[9px] font-bold uppercase tracking-wider">
                          Paid
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => handlePayNow(inst.paystackAccessCode)}
                          isLoading={isPaying}
                          className="bg-[#0037b0] hover:bg-[#1d4ed8] text-white text-[10px] font-bold h-8 px-3 rounded-lg border-0 cursor-pointer shadow-sm flex items-center"
                        >
                          <CreditCard className="mr-1.5 h-3.5 w-3.5" />
                          Pay Installment
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Settlement Bank Details Card (for manual direct transfers) */}
        {invoice.organization.bankAccountNumber && !isPaid && (
          <Card className="mt-6 border border-slate-200/30 shadow-[0px_12px_32px_rgba(0,55,176,0.04)] rounded-2xl overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100/60 p-4">
              <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <FileText className="h-4 w-4 text-[#006c49]" />
                Direct Bank Transfer
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4 bg-white">
              <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                If you prefer to pay via direct bank transfer, please make payments to the merchant's verified account details below:
              </p>
              <div className="bg-[#f8f9ff] p-4 rounded-xl space-y-3 border border-slate-200/20">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-semibold">Bank Name</span>
                  <span className="font-bold text-slate-850">{invoice.organization.settlementBank}</span>
                </div>
                <div className="flex justify-between items-center text-xs border-t border-slate-200/10 pt-2.5">
                  <span className="text-slate-400 font-semibold">Account Number</span>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-slate-850 tabular-nums select-all">
                      {invoice.organization.bankAccountNumber}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (invoice.organization.bankAccountNumber) {
                          navigator.clipboard.writeText(invoice.organization.bankAccountNumber);
                          toast.success("Account number copied!");
                        }
                      }}
                      className="text-[#0037b0] hover:text-[#1d4ed8] font-bold text-[10px] cursor-pointer bg-slate-200/60 hover:bg-slate-250 px-1.5 py-0.5 rounded transition-all active:scale-95 border-0"
                    >
                      Copy
                    </button>
                  </div>
                </div>
                <div className="flex justify-between items-center text-xs border-t border-slate-200/10 pt-2.5">
                  <span className="text-slate-400 font-semibold">Account Name</span>
                  <span className="font-bold text-slate-850 uppercase tracking-tight">
                    {invoice.organization.bankAccountName || invoice.organization.name}
                  </span>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 font-semibold italic text-center">
                Note: Manual transfers may take up to 24 hours to be processed and marked as paid by the vendor.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Pay Now online button (only if NOT paid and NOT using installments) */}
        {invoice.paymentUrl && !isPaid && (!invoice.installments || invoice.installments.length === 0) && (
          <div className="mt-6 text-center">
            <Button size="lg" className="w-full sm:w-auto bg-[#0037b0] hover:bg-[#1d4ed8] text-white font-bold h-11 border-0 rounded-xl shadow-md cursor-pointer" onClick={() => handlePayNow()} isLoading={isPaying}>
              <CreditCard className="mr-2 h-5 w-5" />
              Pay {formatCurrency(outstanding)} Online
            </Button>
            <p className="mt-2 text-xs text-slate-400 font-semibold">
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
    </div>
  )
}
