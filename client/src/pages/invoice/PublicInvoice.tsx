import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Download02Icon,
  CreditCardIcon,
  Invoice03Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  AlertDiamondIcon,
  Cancel01Icon,
  Copy01Icon,
  BankIcon,
  InformationCircleIcon,
} from '@hugeicons/core-free-icons'
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

// ─── Payer-facing status config ──────────────────────────────────────────────
const payerStatus: Record<
  InvoiceStatus,
  {
    label: string
    icon: typeof CheckmarkCircle02Icon
    bg: string
    text: string
    border: string
  }
> = {
  DRAFT: {
    label: 'Not Yet Issued',
    icon: Clock01Icon,
    bg: 'bg-slate-50',
    text: 'text-slate-500',
    border: 'border-slate-200',
  },
  SENT: {
    label: 'Awaiting Payment',
    icon: Clock01Icon,
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
  },
  PAID: {
    label: 'Paid in Full',
    icon: CheckmarkCircle02Icon,
    bg: 'bg-emerald-50',
    text: 'text-[#006c49]',
    border: 'border-emerald-200',
  },
  PARTIALLY_PAID: {
    label: 'Part Paid',
    icon: Clock01Icon,
    bg: 'bg-blue-50',
    text: 'text-[#0037b0]',
    border: 'border-blue-200',
  },
  OVERDUE: {
    label: 'Payment Overdue',
    icon: AlertDiamondIcon,
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
  },
  CANCELLED: {
    label: 'Cancelled',
    icon: Cancel01Icon,
    bg: 'bg-slate-50',
    text: 'text-slate-500',
    border: 'border-slate-200',
  },
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

const calculateGrossAmount = (amount: number): number => {
  let gross = amount;
  if (amount < 2462.50) {
    gross = amount / 0.985;
  } else {
    gross = (amount + 100) / 0.985;
  }
  const fee = gross - amount;
  if (fee > 2000) {
    gross = amount + 2000;
  }
  return Math.round(gross * 100) / 100;
}

export function PublicInvoicePage() {
  const { token } = useParams<{ token: string }>()
  const queryClient = useQueryClient()
  const [isPaying, setIsPaying] = useState(false)
  const [isSimulating, setIsSimulating] = useState<string | null>(null)

  const { data: invoice, isLoading, isError } = useQuery({
    queryKey: ['public-invoice', token],
    queryFn: async () => {
      const response = await apiClient.get<{ data: PublicInvoiceData }>(`/invoices/public/${token}`)
      return response.data.data
    },
    enabled: !!token,
    refetchInterval: (query) => {
      const data = query.state.data
      return data && data.status !== 'PAID' ? 5000 : false
    },
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
          resumeTransaction: (
            accessCode: string,
            config?: {
              onSuccess?: () => void
              onCancel?: () => void
            }
          ) => void
        }
      }).PaystackPop()
      paystack.resumeTransaction(code, {
        onSuccess: () => {
          posthog.capture('public_invoice_payment_completed', {
            invoice_number: invoice.invoiceNumber,
            amount: invoice.total - invoice.amountPaid,
            method: 'paystack_online',
          })
          toast.success('Payment received! Updating invoice status...')
          queryClient.invalidateQueries({ queryKey: ['public-invoice', token] })
        },
        onCancel: () => {
          posthog.capture('public_invoice_payment_cancelled', {
            invoice_number: invoice.invoiceNumber,
          })
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

  const simulatePayment = async (reference?: string, installmentId?: string) => {
    const ref = reference || invoice?.paystackReference
    if (!ref || !invoice) return
    setIsSimulating(installmentId || ref)
    try {
      await apiClient.post('/paystack/simulate-success', { reference: ref })
      toast.success('Payment simulated! Status updating...')
      queryClient.invalidateQueries({ queryKey: ['public-invoice', token] })
    } catch {
      toast.error('Simulation failed. Is the API running in dev mode?')
    } finally {
      setIsSimulating(null)
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
      console.error('Failed to download PDF', error)
    }
  }

  // Fire once when invoice data first loads
  useEffect(() => {
    if (!invoice) return
    posthog.capture('public_invoice_viewed', {
      invoice_number: invoice.invoiceNumber,
      status: invoice.status,
      total: invoice.total,
      has_installments: (invoice.installments?.length ?? 0) > 0,
      has_online_payment: !!invoice.paymentUrl,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice?.invoiceNumber])

  // ─── Loading ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8f9ff] p-4">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#0037b0] border-t-transparent" />
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Loading invoice…</p>
        </div>
      </div>
    )
  }

  if (isError || !invoice) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#f8f9ff] p-4">
        <div className="rounded-2xl bg-white p-8 text-center shadow-[0px_12px_32px_rgba(0,55,176,0.08)] max-w-sm">
          <div className="w-16 h-16 rounded-full bg-rose-50 flex items-center justify-center mx-auto mb-4">
            <HugeiconsIcon icon={AlertDiamondIcon} className="h-8 w-8 text-rose-500" />
          </div>
          <h1 className="text-lg font-bold text-[#121c28]">Invoice Not Found</h1>
          <p className="mt-2 text-sm text-[#434655]">
            This invoice may have been deleted or the link is invalid.
          </p>
        </div>
      </div>
    )
  }

  const outstanding = invoice.total - invoice.amountPaid
  const isPaid = invoice.status === 'PAID'
  const isCancelled = invoice.status === 'CANCELLED'
  const nextUnpaidInstallment = invoice.installments?.find(inst => !inst.isPaid)
  const statusCfg = payerStatus[invoice.status]
  const StatusIcon = statusCfg.icon
  const hasInstallments = (invoice.installments?.length ?? 0) > 0

  return (
    <div className="min-h-screen bg-[#f8f9ff]">

      <div className="px-4 py-6 md:px-8 md:py-10">
        <div className="mx-auto max-w-2xl space-y-5">

          {/* ── Header ──────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            {/* Brand */}
            <div className="flex items-center gap-3 min-w-0">
              {invoice.organization.logo && (
                <img
                  src={invoice.organization.logo}
                  alt={invoice.organization.name}
                  className="h-10 w-10 rounded-xl object-contain shrink-0 border border-slate-100"
                />
              )}
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-[#0037b0] tracking-tight leading-tight truncate">
                  {invoice.organization.name}
                </h1>
                <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-widest mt-0.5">
                  Invoice {invoice.invoiceNumber}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <button
                type="button"
                onClick={downloadPdf}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-bold text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 cursor-pointer transition-colors"
              >
                <HugeiconsIcon icon={Download02Icon} className="h-3.5 w-3.5" />
                {isPaid ? 'Receipt' : 'PDF'}
              </button>

              {invoice.paymentUrl && !isPaid && !isCancelled && !hasInstallments && (
                <button
                  type="button"
                  onClick={() => handlePayNow()}
                  disabled={isPaying}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-xs font-semibold text-white cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 shadow-[0px_4px_12px_rgba(0,55,176,0.15)]"
                  style={{ background: 'linear-gradient(135deg, #0037b0 0%, #1d4ed8 100%)' }}
                >
                  <HugeiconsIcon icon={CreditCardIcon} className="h-3.5 w-3.5" />
                  {isPaying ? 'Loading…' : 'Pay Now'}
                </button>
              )}

              {/* DEV-ONLY: stripped from production builds by Vite */}
              {import.meta.env.DEV && !isPaid && !isCancelled && invoice.paystackReference && !hasInstallments && (
                <button
                  type="button"
                  onClick={() => simulatePayment()}
                  disabled={isSimulating === invoice.paystackReference}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[11px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-300 cursor-pointer transition-colors"
                >
                  ✓ Simulate
                </button>
              )}
            </div>
          </div>

          {/* ── Hero: Amount Due / Paid ──────────────────────────────── */}
          <div
            className={`rounded-2xl p-6 text-center border transition-all ${
              isPaid
                ? 'bg-emerald-50 border-emerald-100'
                : invoice.status === 'OVERDUE'
                ? 'bg-rose-50 border-rose-100'
                : 'bg-white border-slate-200/60'
            }`}
            style={!isPaid && invoice.status !== 'OVERDUE'
              ? { boxShadow: '0px 12px 32px rgba(0,55,176,0.06)' }
              : undefined
            }
          >
            {/* Status pill */}
            <div className="flex justify-center mb-4">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}
              >
                <HugeiconsIcon icon={StatusIcon} className="h-3.5 w-3.5" />
                {statusCfg.label}
              </span>
            </div>

            {isPaid ? (
              <>
                <p className="text-[13px] font-semibold text-[#006c49] uppercase tracking-wider">Amount Paid</p>
                <p className="text-4xl font-bold text-[#006c49] tracking-tight mt-1">
                  {formatCurrency(invoice.total)}
                </p>
                <p className="text-xs text-slate-400 font-semibold mt-2">Thank you — payment received in full</p>
              </>
            ) : (
              <>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                  {hasInstallments && nextUnpaidInstallment ? 'Next Instalment Due' : 'Amount Due'}
                </p>
                <p className={`text-4xl font-bold tracking-tight mt-1 ${invoice.status === 'OVERDUE' ? 'text-rose-700' : 'text-[#0037b0]'}`}>
                  {formatCurrency(
                    hasInstallments && nextUnpaidInstallment
                      ? nextUnpaidInstallment.amount
                      : outstanding
                  )}
                </p>
                {hasInstallments && nextUnpaidInstallment ? (
                  <p className="text-xs text-slate-500 font-semibold mt-2">
                    Instalment: &quot;{nextUnpaidInstallment.label}&quot;
                  </p>
                ) : (
                  <p className={`text-xs font-semibold mt-2 ${invoice.status === 'OVERDUE' ? 'text-rose-600' : 'text-slate-400'}`}>
                    Due {formatDate(invoice.dueDate)}
                  </p>
                )}
              </>
            )}
          </div>

          {/* ── Invoice Details Card ─────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-slate-200/60 overflow-hidden" style={{ boxShadow: '0px 8px 24px rgba(0,55,176,0.05)' }}>

            {/* Card header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <HugeiconsIcon icon={Invoice03Icon} className="h-4 w-4 text-[#0037b0]" />
                <span className="text-sm font-bold text-[#121c28]">Invoice Details</span>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}
              >
                {statusCfg.label}
              </span>
            </div>

            <div className="px-5 py-5 space-y-5">
              {/* Bill To + Dates */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Bill To</p>
                  <p className="font-bold text-[#121c28] text-sm leading-tight">{invoice.client.name}</p>
                  {invoice.client.email && (
                    <p className="text-xs text-[#434655] mt-1">{invoice.client.email}</p>
                  )}
                  {invoice.client.phone && (
                    <p className="text-xs text-[#434655] mt-0.5">{invoice.client.phone}</p>
                  )}
                  {invoice.client.address && (
                    <p className="text-xs text-[#434655] mt-0.5">{invoice.client.address}</p>
                  )}
                </div>
                <div className="flex flex-col gap-2 sm:items-end">
                  <div className="sm:text-right">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Issue Date</p>
                    <p className="text-sm font-bold text-[#121c28] mt-0.5">{formatDate(invoice.issueDate)}</p>
                  </div>
                  <div className="sm:text-right">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Due Date</p>
                    <p className={`text-sm font-bold mt-0.5 ${invoice.status === 'OVERDUE' ? 'text-rose-600' : 'text-[#121c28]'}`}>
                      {formatDate(invoice.dueDate)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Line Items */}
              <div className="rounded-xl overflow-hidden border border-slate-100">
                {/* Table header */}
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 px-3 py-2.5 bg-[#eef4ff]">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Description</span>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Qty</span>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Price</span>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Amount</span>
                </div>

                {/* Rows */}
                {invoice.items.map((item, index) => (
                  <div
                    key={index}
                    className={`grid grid-cols-[1fr_auto_auto_auto] gap-x-3 px-3 py-3 text-xs ${
                      index % 2 === 1 ? 'bg-[#f8f9ff]' : 'bg-white'
                    }`}
                  >
                    <span className="font-semibold text-[#121c28] leading-snug pr-2">{item.description}</span>
                    <span className="text-[#434655] text-right tabular-nums self-start">{item.quantity}</span>
                    <span className="text-[#434655] text-right tabular-nums self-start">{formatCurrency(item.unitPrice)}</span>
                    <span className="font-bold text-[#121c28] text-right tabular-nums self-start">{formatCurrency(item.amount)}</span>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between text-xs">
                  <span className="text-[#434655] font-semibold">Subtotal</span>
                  <span className="font-semibold text-[#121c28] tabular-nums">{formatCurrency(invoice.subtotal)}</span>
                </div>

                {(invoice.discountAmount || 0) > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-[#006c49] font-semibold">
                      Discount{invoice.discountType !== 'FIXED' ? ` (${invoice.discountPercent}%)` : ''}
                    </span>
                    <span className="font-semibold text-[#006c49] tabular-nums">
                      −{formatCurrency(invoice.discountAmount || 0)}
                    </span>
                  </div>
                )}

                {invoice.taxAmount > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-[#434655] font-semibold">VAT ({invoice.taxRate ?? 7.5}%)</span>
                    <span className="font-semibold text-[#121c28] tabular-nums">{formatCurrency(invoice.taxAmount)}</span>
                  </div>
                )}

                <div className="flex justify-between items-center pt-2 border-t border-slate-100 mt-2">
                  <span className="text-sm font-semibold text-[#121c28]">Total</span>
                  <span className="text-lg font-bold text-[#121c28] tabular-nums">{formatCurrency(invoice.total)}</span>
                </div>

                {invoice.amountPaid > 0 && (
                  <>
                    <div className="flex justify-between text-xs">
                      <span className="text-[#006c49] font-semibold">Paid</span>
                      <span className="font-semibold text-[#006c49] tabular-nums">−{formatCurrency(invoice.amountPaid)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-1.5 border-t border-dashed border-slate-200">
                      <span className="text-sm font-bold text-[#121c28]">Balance Due</span>
                      <span className={`text-base font-bold tabular-nums ${outstanding <= 0 ? 'text-[#006c49]' : 'text-[#0037b0]'}`}>
                        {outstanding <= 0 ? '₦0' : formatCurrency(outstanding)}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Notes & Terms */}
              {invoice.notes && (
                <div className="pt-1 border-t border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Notes</p>
                  <p className="text-xs text-[#434655] leading-relaxed">{invoice.notes}</p>
                </div>
              )}
              {invoice.terms && (
                <div className="pt-1 border-t border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Terms &amp; Conditions</p>
                  <p className="text-xs text-[#434655] leading-relaxed">{invoice.terms}</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Payment Schedule (installments) ─────────────────────── */}
          {hasInstallments && invoice.installments && (
            <div className="bg-white rounded-2xl border border-slate-200/60 overflow-hidden" style={{ boxShadow: '0px 8px 24px rgba(0,55,176,0.05)' }}>
              <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
                <HugeiconsIcon icon={CreditCardIcon} className="h-4 w-4 text-[#0037b0]" />
                <span className="text-sm font-extrabold text-[#121c28]">Payment Schedule</span>
              </div>
              <div className="p-4 space-y-2.5">
                {invoice.installments.map((inst) => (
                  <div
                    key={inst.id}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border transition-all ${
                      inst.isPaid
                        ? 'bg-emerald-50 border-emerald-100'
                        : 'bg-[#f8f9ff] border-slate-100'
                    }`}
                  >
                    {/* Label + sequence */}
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                        inst.isPaid
                          ? 'bg-white text-[#006c49] border border-emerald-200'
                          : 'bg-[#eef4ff] text-[#0037b0] border border-blue-100'
                      }`}>
                        {inst.isPaid
                          ? <HugeiconsIcon icon={CheckmarkCircle02Icon} className="h-4 w-4" />
                          : inst.sequence}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-[#121c28]">{inst.label}</p>
                        <p className="text-[10px] text-slate-400 font-semibold mt-0.5">{inst.percentage}% of total</p>
                        {!inst.isPaid && (
                          <p className="text-[9px] text-[#0037b0] font-semibold mt-0.5">
                            Incl. processing fee: {formatCurrency(calculateGrossAmount(Number(inst.amount)))}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Amount + action */}
                    <div className="flex items-center justify-between sm:justify-end gap-3">
                      <span className="text-sm font-bold text-[#121c28] tabular-nums">
                        {formatCurrency(inst.amount)}
                      </span>

                      {inst.isPaid ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-emerald-200 text-[#006c49] text-[10px] font-bold uppercase tracking-wider">
                          <HugeiconsIcon icon={CheckmarkCircle02Icon} className="h-3 w-3" />
                          Paid
                        </span>
                      ) : isCancelled ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                          Cancelled
                        </span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handlePayNow(inst.paystackAccessCode)}
                            disabled={isPaying}
                            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[11px] font-semibold text-white cursor-pointer transition-all disabled:opacity-60"
                            style={{ background: 'linear-gradient(135deg, #0037b0 0%, #1d4ed8 100%)' }}
                          >
                            <HugeiconsIcon icon={CreditCardIcon} className="h-3.5 w-3.5" />
                            Pay Instalment
                          </button>
                          {import.meta.env.DEV && inst.paystackReference && (
                            <button
                              type="button"
                              onClick={() => simulatePayment(inst.paystackReference, inst.id)}
                              disabled={isSimulating === inst.id}
                              className="inline-flex items-center h-9 px-2.5 rounded-lg text-[11px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-300 cursor-pointer"
                            >
                              ✓ Sim
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Online Payment ────────────────────────────────────────── */}
          {!isPaid && !isCancelled && !hasInstallments && invoice.paymentUrl && (
            <div className="bg-white rounded-2xl border border-slate-200/60 overflow-hidden" style={{ boxShadow: '0px 8px 24px rgba(0,55,176,0.05)' }}>
              <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
                <HugeiconsIcon icon={CreditCardIcon} className="h-4 w-4 text-[#0037b0]" />
                <span className="text-sm font-bold text-[#121c28]">Online Payment</span>
              </div>
              <div className="p-5 space-y-4">
                <p className="text-xs text-[#434655] leading-relaxed">
                  Pay instantly using your card, bank transfer, or USSD code. The invoice status will be updated immediately.
                </p>
                
                <div className="rounded-xl bg-[#f8f9ff] border border-slate-100 p-4 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Invoice Amount</span>
                    <span className="font-semibold text-slate-800 tabular-nums">{formatCurrency(outstanding)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Online Processing Fee</span>
                    <span className="font-semibold text-slate-800 tabular-nums">{formatCurrency(calculateGrossAmount(outstanding) - outstanding)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-slate-100 mt-2">
                    <span className="text-sm font-bold text-[#121c28]">Total to Pay</span>
                    <span className="text-base font-bold text-[#0037b0] tabular-nums">
                      {formatCurrency(calculateGrossAmount(outstanding))}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handlePayNow()}
                  disabled={isPaying}
                  className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-lg text-sm font-semibold text-white cursor-pointer transition-all disabled:opacity-60 hover:scale-[1.01] active:scale-[0.99]"
                  style={{ background: 'linear-gradient(135deg, #0037b0 0%, #1d4ed8 100%)' }}
                >
                  <HugeiconsIcon icon={CreditCardIcon} className="h-4 w-4" />
                  {isPaying ? 'Processing…' : `Pay ${formatCurrency(calculateGrossAmount(outstanding))}`}
                </button>
              </div>
            </div>
          )}

          {/* ── Direct Bank Transfer ─────────────────────────────────── */}
          {invoice.organization.bankAccountNumber && !isPaid && !isCancelled && (
            <div className="bg-white rounded-2xl border border-slate-200/60 overflow-hidden" style={{ boxShadow: '0px 8px 24px rgba(0,55,176,0.05)' }}>
              <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
                <HugeiconsIcon icon={BankIcon} className="h-4 w-4 text-[#006c49]" />
                <span className="text-sm font-bold text-[#121c28]">Direct Bank Transfer</span>
              </div>
              <div className="p-5 space-y-4">
                <p className="text-xs text-[#434655] leading-relaxed">
                  Prefer to pay by bank transfer? Use the account details below. Make sure to use your
                  name or invoice number as the payment reference.
                </p>

                <div className="rounded-xl bg-[#f8f9ff] border border-slate-100 overflow-hidden">
                  <div className="flex justify-between items-center px-4 py-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Bank</span>
                    <span className="text-xs font-bold text-[#121c28]">{invoice.organization.settlementBank}</span>
                  </div>
                  <div className="flex justify-between items-center px-4 py-3 bg-white border-t border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Account Number</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[#121c28] tabular-nums select-all">
                        {invoice.organization.bankAccountNumber}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (invoice.organization.bankAccountNumber) {
                            navigator.clipboard.writeText(invoice.organization.bankAccountNumber)
                            posthog.capture('public_invoice_bank_details_copied', {
                              invoice_number: invoice.invoiceNumber,
                            })
                            toast.success('Account number copied!')
                          }
                        }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold text-[#0037b0] bg-[#eef4ff] hover:bg-[#e5eeff] cursor-pointer transition-colors border-0"
                      >
                        <HugeiconsIcon icon={Copy01Icon} className="h-3 w-3" />
                        Copy
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between items-center px-4 py-3 bg-[#f8f9ff] border-t border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Account Name</span>
                    <span className="text-xs font-bold text-[#121c28] uppercase tracking-tight">
                      {invoice.organization.bankAccountName || invoice.organization.name}
                    </span>
                  </div>
                </div>

                {/* Important reconciliation notice */}
                <div className="flex gap-2.5 rounded-xl bg-amber-50 border border-amber-200 p-3.5">
                  <HugeiconsIcon icon={InformationCircleIcon} className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-amber-800">Manual transfer — human confirmation needed</p>
                    <p className="text-[11px] text-amber-700 leading-relaxed">
                      Direct bank transfers are <strong>not automatically reconciled</strong>. After you pay,
                      please notify {invoice.organization.name} with your proof of payment so they can update
                      your invoice status. Alternatively, use the <strong>Pay Now</strong> button above for
                      instant confirmation.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Full-width Pay Now CTA (non-installment) ─────────────── */}
          {invoice.paymentUrl && !isPaid && !isCancelled && !hasInstallments && (
            <div className="text-center">
              <button
                type="button"
                onClick={() => handlePayNow()}
                disabled={isPaying}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-12 px-8 rounded-xl text-sm font-semibold text-white cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 shadow-[0px_8px_24px_rgba(0,55,176,0.2)]"
                style={{ background: 'linear-gradient(135deg, #0037b0 0%, #1d4ed8 100%)' }}
              >
                <HugeiconsIcon icon={CreditCardIcon} className="h-5 w-5" />
                {isPaying ? 'Loading payment…' : `Pay ${formatCurrency(outstanding)} Online`}
              </button>
              <p className="mt-2.5 text-[11px] text-slate-400 font-semibold flex items-center justify-center gap-1.5">
                <svg className="h-3.5 w-3.5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Secure payment · Bank transfer or card · Powered by Paystack
              </p>
            </div>
          )}

          {/* ── Footer ───────────────────────────────────────────────── */}
          <div className="pb-8 text-center">
            <p className="text-[11px] text-slate-400 font-semibold">
              Invoice from{' '}
              <span className="text-[#0037b0] font-bold">{invoice.organization.name}</span>
              {invoice.organization.email && (
                <> · <a href={`mailto:${invoice.organization.email}`} className="hover:underline">{invoice.organization.email}</a></>
              )}
            </p>
          </div>

        </div>
      </div>
    </div>
  )
}
