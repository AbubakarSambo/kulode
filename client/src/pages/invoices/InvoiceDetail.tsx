import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  SentIcon,
  Cancel01Icon,
  Delete02Icon,
  PlusSignIcon,
  CreditCardIcon,
  Link02Icon,
  CopyIcon,
  Share02Icon,
  Download02Icon,
  AlertDiamondIcon,
  Tick01Icon,
} from '@hugeicons/core-free-icons'

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}
import { Header } from '@/components/layout'
import { Button, Input, Label, Select, Textarea, Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { Modal } from '@/components/shared/Modal'
import { invoicesApi, paymentsApi, organizationsApi } from '@/api'
import apiClient from '@/api/client'
import type { ApiResponse } from '@/types'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { posthog } from '@/lib/posthog'
import type { InvoiceStatus, PaymentMethod } from '@/types'
import { useAuthStore } from '@/stores/auth'

const renderStatusPill = (status: InvoiceStatus) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const configs: Record<InvoiceStatus, { bg: string; text: string; border: string; label: string; icon?: any }> = {
    PAID: {
      bg: 'bg-emerald-500/10',
      text: 'text-emerald-700',
      border: 'border-emerald-500/20',
      label: 'Paid',
      icon: Tick01Icon,
    },
    OVERDUE: {
      bg: 'bg-rose-500/10',
      text: 'text-rose-700',
      border: 'border-rose-500/20',
      label: 'Overdue',
      icon: Cancel01Icon,
    },
    PARTIALLY_PAID: {
      bg: 'bg-amber-500/10',
      text: 'text-amber-700',
      border: 'border-amber-500/20',
      label: 'Part Paid',
      icon: PlusSignIcon,
    },
    SENT: {
      bg: 'bg-blue-500/10',
      text: 'text-blue-700',
      border: 'border-blue-500/20',
      label: 'Sent',
      icon: SentIcon,
    },
    DRAFT: {
      bg: 'bg-slate-500/10',
      text: 'text-slate-700',
      border: 'border-slate-500/20',
      label: 'Draft',
    },
    CANCELLED: {
      bg: 'bg-slate-500/10',
      text: 'text-slate-700',
      border: 'border-slate-500/20',
      label: 'Cancelled',
      icon: Cancel01Icon,
    },
  }

  const config = configs[status]
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border select-none shadow-sm",
      config.bg,
      config.text,
      config.border
    )}>
      {config.icon && <HugeiconsIcon icon={config.icon} size={10} strokeWidth={2.5} />}
      {config.label}
    </span>
  )
}

const paymentSchema = z.object({
  amount: z.number().min(0.01, 'Amount must be greater than 0'),
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'CARD', 'OTHER']),
  paymentDate: z.string().min(1, 'Payment date is required'),
  reference: z.string().optional(),
  notes: z.string().optional(),
})

type PaymentFormData = z.infer<typeof paymentSchema>

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
  const [isPaymentLinkModalOpen, setIsPaymentLinkModalOpen] = useState(false)
  const [downloadingReceiptId, setDownloadingReceiptId] = useState<string | null>(null)
  const [isSharing, setIsSharing] = useState(false)

  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoices', id],
    queryFn: () => invoicesApi.get(id!),
    enabled: !!id,
  })

  const { data: organization } = useQuery({
    queryKey: ['organization'],
    queryFn: () => organizationsApi.getCurrent(),
  })

  const sendMutation = useMutation({
    mutationFn: () => invoicesApi.send(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices', id] })
      posthog.capture('invoice_sent', { invoice_id: id })
      toast.success('Invoice sent', { description: 'Invoice has been marked as sent' })
    },
  })

  const cancelMutation = useMutation({
    mutationFn: () => invoicesApi.cancel(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices', id] })
      posthog.capture('invoice_cancelled', { invoice_id: id })
      toast.success('Invoice cancelled')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => invoicesApi.delete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      posthog.capture('invoice_deleted', { invoice_id: id })
      toast.success('Invoice deleted')
      navigate('/invoices')
    },
  })

  const generateLinkMutation = useMutation({
    mutationFn: async ({ email, amount }: { email: string; amount: number }) => {
      const response = await apiClient.post<ApiResponse<{ paymentUrl: string; reference: string }>>(
        `/invoices/${id}/generate-payment-link`,
        { email, amount }
      )
      return response.data.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['invoices', id] })
      posthog.capture('payment_link_generated', { invoice_id: id })
      toast.success('Payment link generated')
      setIsPaymentLinkModalOpen(false)
      window.open(data.paymentUrl, '_blank')
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (error: any) => {
      toast.error('Failed to generate payment link', {
        description: error.response?.data?.message || 'Paystack may not be set up',
      })
    },
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      amount: 0,
      paymentMethod: 'BANK_TRANSFER',
      paymentDate: new Date().toISOString().split('T')[0],
      reference: '',
      notes: '',
    },
  })

  const paymentMutation = useMutation({
    mutationFn: (data: PaymentFormData) => paymentsApi.createForInvoice(id!, {
      ...data,
      paymentMethod: data.paymentMethod as PaymentMethod,
    }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['invoices', id] })
      queryClient.refetchQueries({ queryKey: ['payments'] })
      posthog.capture('payment_recorded', {
        invoice_id: id,
        payment_method: variables.paymentMethod,
      })
      toast.success('Payment recorded')
      setIsPaymentModalOpen(false)
      reset()
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (error: any) => {
      toast.error('Failed to record payment', {
        description: error.response?.data?.message,
      })
    },
  })

  const onSubmitPayment = (data: PaymentFormData) => {
    paymentMutation.mutate(data)
  }

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this invoice?')) {
      deleteMutation.mutate()
    }
  }

  const openPaymentModal = () => {
    if (invoice) {
      reset({
        amount: Number(invoice.total) - Number(invoice.amountPaid),
        paymentMethod: 'BANK_TRANSFER',
        paymentDate: new Date().toISOString().split('T')[0],
        reference: '',
        notes: '',
      })
    }
    setIsPaymentModalOpen(true)
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center">
        <p className="text-muted-foreground">Invoice not found</p>
        <Button className="mt-4" onClick={() => navigate('/invoices')}>
          Back to Invoices
        </Button>
      </div>
    )
  }

  const outstanding = Number(invoice.total) - Number(invoice.amountPaid)
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'
  const canRecordPayment = invoice.status !== 'DRAFT' && invoice.status !== 'CANCELLED' && invoice.status !== 'PAID'
  const canSend = invoice.status === 'DRAFT'
  const canCancel = invoice.status !== 'PAID' && invoice.status !== 'CANCELLED'
  const canDelete = isSuperAdmin || invoice.status === 'DRAFT'
  const canGenerateLink = invoice.status !== 'CANCELLED' && invoice.status !== 'PAID'
  const hasPaymentLink = !!invoice.paymentUrl

  const copyPaymentLink = () => {
    const url = invoice.paymentUrl
    if (url) {
      navigator.clipboard.writeText(url)
      posthog.capture('payment_link_copied', { invoice_id: id })
      toast.success('Payment link copied to clipboard')
    }
  }

  const downloadPdf = async () => {
    try {
      const response = await apiClient.get(`/invoices/${id}/pdf`, {
        responseType: 'blob',
      })
      const blob = new Blob([response.data], { type: 'application/pdf' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${invoice.invoiceNumber}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      posthog.capture('invoice_pdf_downloaded', { invoice_id: id })
    } catch {
      toast.error('Failed to download PDF')
    }
  }

  const shareInvoice = async () => {
    setIsSharing(true)
    try {
      const response = await apiClient.get(`/invoices/${id}/pdf`, { responseType: 'blob' })
      const blob = new Blob([response.data], { type: 'application/pdf' })
      const file = new File([blob], `${invoice.invoiceNumber}.pdf`, { type: 'application/pdf' })

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Invoice ${invoice.invoiceNumber}` })
      } else {
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `${invoice.invoiceNumber}.pdf`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        window.URL.revokeObjectURL(url)
      }

      posthog.capture('invoice_shared', { invoice_id: id })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      toast.error('Failed to share invoice')
    } finally {
      setIsSharing(false)
    }
  }

  const downloadReceipt = async (paymentId: string) => {
    setDownloadingReceiptId(paymentId)
    try {
      const blob = await paymentsApi.downloadReceipt(paymentId)
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `receipt-${invoice.invoiceNumber}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      posthog.capture('payment_receipt_downloaded', { invoice_id: id, payment_id: paymentId })
    } catch {
      toast.error('Failed to download receipt')
    } finally {
      setDownloadingReceiptId(null)
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[#f8f9ff]">
      <Header
        title={invoice.invoiceNumber}
        description={`Invoice for ${invoice.client.name}`}
        category={
          <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
            <Link to="/invoices" className="hover:text-[#0037b0] transition-colors">Invoices</Link>
            <span className="text-slate-300">/</span>
            <span className="text-[#0037b0]">Detail</span>
          </div>
        }
        action={
          <div className="flex flex-wrap gap-2">
            {invoice.status !== 'DRAFT' && (
              <Button variant="outline" onClick={shareInvoice} isLoading={isSharing} className="h-10 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors">
                {!isSharing && <WhatsAppIcon className="mr-2 h-4 w-4" />}
                Share
              </Button>
            )}
            <Button variant="outline" onClick={downloadPdf} className="h-10 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors">
              <HugeiconsIcon icon={Download02Icon} size={16} className="mr-2" strokeWidth={1.5} />
              PDF
            </Button>
            {canGenerateLink && !hasPaymentLink && (
              <Button onClick={() => setIsPaymentLinkModalOpen(true)} className="h-10 px-4 rounded-xl bg-gradient-to-r from-[#0037b0] to-[#1d4ed8] text-white shadow-[0px_4px_12px_rgba(0,55,176,0.15)] hover:opacity-95">
                <HugeiconsIcon icon={Link02Icon} size={16} className="mr-2" strokeWidth={1.5} />
                Generate Payment Link
              </Button>
            )}
            {hasPaymentLink && (
              <>
                <Button variant="outline" onClick={copyPaymentLink} className="h-10 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors">
                  <HugeiconsIcon icon={CopyIcon} size={16} className="mr-2" strokeWidth={1.5} />
                  Copy Link
                </Button>
                <a href={invoice.paymentUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" className="h-10 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors">
                    <HugeiconsIcon icon={Share02Icon} size={16} className="mr-2" strokeWidth={1.5} />
                    Open Link
                  </Button>
                </a>
              </>
            )}
            {canRecordPayment && (
              <Button onClick={openPaymentModal} className="h-10 px-4 rounded-xl bg-gradient-to-r from-[#0037b0] to-[#1d4ed8] text-white shadow-[0px_4px_12px_rgba(0,55,176,0.15)] hover:opacity-95">
                <HugeiconsIcon icon={PlusSignIcon} size={16} className="mr-2" strokeWidth={1.5} />
                Record Payment
              </Button>
            )}
            {canSend && (
              <Button variant="outline" onClick={() => sendMutation.mutate()} className="h-10 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors">
                <HugeiconsIcon icon={SentIcon} size={16} className="mr-2" strokeWidth={1.5} />
                Mark as Sent
              </Button>
            )}
            {canCancel && (
              <Button variant="outline" onClick={() => cancelMutation.mutate()} className="h-10 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-rose-600 hover:text-rose-700 transition-colors">
                <HugeiconsIcon icon={Cancel01Icon} size={16} className="mr-2" strokeWidth={1.5} />
                Cancel
              </Button>
            )}
            {canDelete && (
              <Button variant="outline" onClick={handleDelete} className="h-10 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-rose-600 hover:text-rose-700 transition-colors">
                <HugeiconsIcon icon={Delete02Icon} size={16} className="mr-2" strokeWidth={1.5} />
                Delete
              </Button>
            )}
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-4 sm:p-8">
        <div className="mx-auto max-w-7xl">
          {/* Mobile Quick Action Strip (only visible on mobile screens) */}
          <div className="flex flex-wrap gap-2 sm:hidden bg-white p-4 rounded-[20px] shadow-[0px_8px_24px_rgba(0,55,176,0.02)] border border-[#eef4ff]/50 mb-6">
            {invoice.status !== 'DRAFT' && (
              <Button variant="outline" size="sm" onClick={shareInvoice} isLoading={isSharing} className="h-9 px-3 text-xs rounded-lg flex-1 min-w-[80px]">
                {!isSharing && <WhatsAppIcon className="mr-1.5 h-3.5 w-3.5" />}
                Share
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={downloadPdf} className="h-9 px-3 text-xs rounded-lg flex-1 min-w-[80px]">
              <HugeiconsIcon icon={Download02Icon} size={14} className="mr-1.5" strokeWidth={1.5} />
              PDF
            </Button>
            {canRecordPayment && (
              <Button size="sm" onClick={openPaymentModal} className="h-9 px-3 text-xs rounded-lg bg-gradient-to-r from-[#0037b0] to-[#1d4ed8] text-white flex-1 min-w-[120px]">
                <HugeiconsIcon icon={PlusSignIcon} size={14} className="mr-1.5" strokeWidth={1.5} />
                Record Payment
              </Button>
            )}
            {canGenerateLink && !hasPaymentLink && (
              <Button size="sm" onClick={() => setIsPaymentLinkModalOpen(true)} className="h-9 px-3 text-xs rounded-lg bg-gradient-to-r from-[#0037b0] to-[#1d4ed8] text-white flex-1 min-w-[120px]">
                <HugeiconsIcon icon={Link02Icon} size={14} className="mr-1.5" strokeWidth={1.5} />
                Pay Link
              </Button>
            )}
            {hasPaymentLink && (
              <>
                <Button variant="outline" size="sm" onClick={copyPaymentLink} className="h-9 px-3 text-xs rounded-lg flex-1 min-w-[90px]">
                  <HugeiconsIcon icon={CopyIcon} size={14} className="mr-1.5" strokeWidth={1.5} />
                  Copy Link
                </Button>
              </>
            )}
            {canSend && (
              <Button variant="outline" size="sm" onClick={() => sendMutation.mutate()} className="h-9 px-3 text-xs rounded-lg flex-1 min-w-[90px]">
                <HugeiconsIcon icon={SentIcon} size={14} className="mr-1.5" strokeWidth={1.5} />
                Send
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* LEFT COLUMN: THE PHYSICAL INVOICE SHEET (lg:col-span-8) - Sits 2nd on mobile */}
            <div className="lg:col-span-8 order-2 lg:order-1 bg-white rounded-3xl p-6 sm:p-10 shadow-[0px_16px_48px_rgba(0,55,176,0.03)] border border-[#eef4ff]/50 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#0037b0] to-[#1d4ed8]" />
              
              {/* Document Header */}
              <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-10 pb-8 border-b border-[#eef4ff]/40">
                <div>
                  <h2 className="text-base font-extrabold tracking-tight text-slate-800 uppercase">
                    {organization?.name || 'Acme Corporation'}
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">Corporate Invoice Dossier</p>
                </div>
                <div className="sm:text-right">
                  <span className="text-[9px] font-black uppercase tracking-widest text-[#0037b0] bg-[#0037b0]/6 px-2.5 py-1 rounded-md">
                    INVOICE
                  </span>
                  <h1 className="text-xl font-black tracking-tight text-slate-900 mt-2.5">{invoice.invoiceNumber}</h1>
                </div>
              </div>

              {/* Bilateral Details Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-10">
                <div className="bg-[#f8f9ff]/50 p-5 rounded-2xl border border-[#eef4ff]/30">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-2">Billed To</span>
                  <Link to={`/clients/${invoice.client.id}`} className="text-sm font-bold text-[#0037b0] hover:underline block truncate max-w-[280px]">
                    {invoice.client.name}
                  </Link>
                  {invoice.client.email && (
                    <span className="text-xs text-slate-500 block mt-1.5 truncate max-w-[280px]">{invoice.client.email}</span>
                  )}
                  {invoice.client.phone && (
                    <span className="text-xs text-slate-500 block mt-0.5">{invoice.client.phone}</span>
                  )}
                </div>
                <div className="bg-[#f8f9ff]/50 p-5 rounded-2xl border border-[#eef4ff]/30 sm:text-right flex flex-col justify-between gap-3">
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Issue Date</span>
                    <span className="text-xs font-bold text-slate-700">{formatDate(invoice.issueDate)}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Due Date</span>
                    <span className="text-xs font-bold text-rose-600">{formatDate(invoice.dueDate)}</span>
                  </div>
                </div>
              </div>

              {/* Line Items Table */}
              <div className="pt-2 overflow-x-auto">
                <table className="w-full min-w-[400px]">
                  <thead>
                    <tr className="text-xs font-bold uppercase tracking-widest text-slate-400 border-b border-[#eef4ff]/40">
                      <th className="pb-3 text-left font-bold">Description</th>
                      <th className="pb-3 text-right font-bold w-16">Qty</th>
                      <th className="pb-3 text-right font-bold w-32">Price</th>
                      <th className="pb-3 text-right font-bold w-32">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-0">
                    {invoice.items.map((item, index) => (
                      <tr 
                      key={index} 
                      className={cn(
                        "transition-colors hover:bg-[#eef4ff]/20 border-b border-[#eef4ff]/25 last:border-b-0",
                        index % 2 === 0 ? "bg-transparent" : "bg-[#f8f9ff]/30"
                      )}
                    >
                      <td className="py-4 text-sm font-medium text-slate-800">{item.description}</td>
                      <td className="py-4 text-right text-sm font-medium text-slate-650 tabular-nums">{item.quantity}</td>
                      <td className="py-4 text-right text-sm font-medium text-slate-650 tabular-nums">{formatCurrency(item.unitPrice)}</td>
                      <td className="py-4 text-right text-sm font-bold text-slate-900 tabular-nums">{formatCurrency(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-[#eef4ff]/50">
                  <tr>
                    <td colSpan={3} className="py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-400">Subtotal</td>
                    <td className="py-3 text-right text-sm font-bold text-slate-900 tabular-nums">{formatCurrency(invoice.subtotal)}</td>
                  </tr>
                  {Number(invoice.discountAmount) > 0 && (
                    <tr className="text-emerald-600">
                      <td colSpan={3} className="py-1.5 text-right text-xs font-bold uppercase tracking-wider">Discount ({invoice.discountPercent}%)</td>
                      <td className="py-1.5 text-right text-sm font-bold tabular-nums">-{formatCurrency(invoice.discountAmount ?? 0)}</td>
                    </tr>
                  )}
                  {Number(invoice.taxAmount) > 0 && (
                    <tr className="text-slate-500">
                      <td colSpan={3} className="py-1.5 text-right text-xs font-bold uppercase tracking-wider text-slate-400">VAT ({invoice.taxRate ?? 7.5}%)</td>
                      <td className="py-1.5 text-right text-sm font-semibold text-slate-700 tabular-nums">{formatCurrency(invoice.taxAmount)}</td>
                    </tr>
                  )}
                  <tr className="border-t border-[#eef4ff]/60 bg-[#0037b0]/02">
                    <td colSpan={3} className="py-4 text-right text-xs font-black uppercase tracking-wider text-slate-700">Total</td>
                    <td className="py-4 text-right text-lg font-black text-slate-900 tabular-nums">{formatCurrency(invoice.total)}</td>
                  </tr>
                  {Number(invoice.amountPaid) > 0 && (
                    <>
                      <tr className="text-emerald-600">
                        <td colSpan={3} className="py-2 text-right text-xs font-bold uppercase tracking-wider">Paid</td>
                        <td className="py-2 text-right text-sm font-bold tabular-nums">-{formatCurrency(invoice.amountPaid)}</td>
                      </tr>
                      <tr className="font-extrabold border-t border-dashed border-slate-200">
                        <td colSpan={3} className="py-3 text-right text-xs font-black uppercase tracking-wider text-slate-700">Balance Due</td>
                        <td className="py-3 text-right text-base font-black text-slate-900 tabular-nums">{formatCurrency(outstanding)}</td>
                      </tr>
                    </>
                  )}
                </tfoot>
              </table>
            </div>

            {/* Notes */}
            {invoice.notes && (
              <div className="border-t border-[#eef4ff]/30 pt-4 mt-8">
                <p className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400">Notes</p>
                <p className="mt-2 text-sm text-slate-605 leading-relaxed bg-[#f8f9ff]/50 p-4 rounded-xl border border-[#eef4ff]/30">{invoice.notes}</p>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: WORKSPACE SIDEBAR PANEL (lg:col-span-4) - Sits 1st on mobile */}
          <div className="lg:col-span-4 order-1 lg:order-2 space-y-6">
            {/* Workflow Stepper */}
            <div className="bg-white rounded-3xl p-6 shadow-[0px_12px_32px_rgba(0,55,176,0.03)] border border-[#eef4ff]/50">
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[#0037b0]" />
                Lifecycle Progress
              </h3>
              <div className="relative pl-6 border-l border-slate-100 space-y-6 ml-3">
                {/* Step 1: Draft */}
                <div className="relative">
                  <span className="absolute -left-[32px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white text-[9px] font-bold shadow-sm">✓</span>
                  <div>
                    <p className="text-xs font-extrabold text-slate-800">Draft Created</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Initialized on {formatDate(invoice.createdAt)}</p>
                  </div>
                </div>

                {/* Step 2: Sent */}
                <div className="relative">
                  {invoice.status !== 'DRAFT' ? (
                    <span className="absolute -left-[32px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white text-[9px] font-bold shadow-sm">✓</span>
                  ) : (
                    <span className="absolute -left-[32px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-slate-400 text-[9px] font-bold shadow-sm">•</span>
                  )}
                  <div>
                    <p className={cn("text-xs font-extrabold", invoice.status !== 'DRAFT' ? "text-slate-800" : "text-slate-450")}>Sent to Client</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {invoice.status !== 'DRAFT' ? "Dispatched successfully" : "Awaiting dispatch"}
                    </p>
                  </div>
                </div>

                {/* Step 3: Settled/Overdue */}
                <div className="relative">
                  {invoice.status === 'PAID' ? (
                    <span className="absolute -left-[32px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white text-[9px] font-bold shadow-sm">✓</span>
                  ) : invoice.status === 'OVERDUE' ? (
                    <span className="absolute -left-[32px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-white text-[9px] font-bold shadow-sm">!</span>
                  ) : (
                    <span className="absolute -left-[32px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-slate-400 text-[9px] font-bold shadow-sm">•</span>
                  )}
                  <div>
                    <p className={cn(
                      "text-xs font-extrabold",
                      invoice.status === 'PAID' && "text-emerald-700",
                      invoice.status === 'OVERDUE' && "text-rose-600",
                      (invoice.status !== 'PAID' && invoice.status !== 'OVERDUE') && "text-slate-450"
                    )}>
                      {invoice.status === 'PAID' ? "Fully Settled" : invoice.status === 'OVERDUE' ? "Payment Overdue" : "Settlement"}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {invoice.status === 'PAID' ? "Cleared via transaction" : invoice.status === 'OVERDUE' ? `Due since ${formatDate(invoice.dueDate)}` : "Awaiting settlement"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Ledger Summary Stats */}
            <div className="bg-white rounded-3xl p-6 shadow-[0px_12px_32px_rgba(0,55,176,0.03)] border border-[#eef4ff]/50 space-y-4">
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[#0037b0]" />
                Ledger Overview
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#f8f9ff]/50 p-4 rounded-2xl border border-[#eef4ff]/30">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Total Billed</span>
                  <p className="text-sm font-black text-slate-900 mt-1 tabular-nums">{formatCurrency(invoice.total)}</p>
                </div>
                <div className="bg-[#f8f9ff]/50 p-4 rounded-2xl border border-[#eef4ff]/30">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Paid To Date</span>
                  <p className="text-sm font-black text-emerald-600 mt-1 tabular-nums">{formatCurrency(invoice.amountPaid)}</p>
                </div>
              </div>
              
              {/* Progress bar for partial payments */}
              {Number(invoice.amountPaid) > 0 && (
                <div className="space-y-2 pt-3 border-t border-slate-200/40">
                  <div className="flex justify-between items-center text-[10px] font-bold text-slate-400">
                    <span>Payment Progress</span>
                    <span className="text-[#0037b0]">{Math.round((Number(invoice.amountPaid) / Number(invoice.total)) * 100)}% paid</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-[#0037b0] to-[#1d4ed8] rounded-full transition-all duration-500" 
                      style={{ width: `${Math.min(100, (Number(invoice.amountPaid) / Number(invoice.total)) * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              <div className={cn(
                "p-4 rounded-2xl border flex justify-between items-center",
                outstanding > 0 ? "bg-rose-50/30 border-rose-500/10 text-rose-950" : "bg-emerald-50/30 border-emerald-500/10 text-emerald-950"
              )}>
                <div>
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Balance Due</span>
                  <p className="text-base font-black tracking-tight mt-0.5 tabular-nums">{formatCurrency(outstanding)}</p>
                </div>
                {renderStatusPill(invoice.status)}
              </div>
            </div>

            {/* Payments Ledger Card */}
            <Card className="border-0 shadow-[0px_12px_32px_rgba(0,55,176,0.03)] bg-white rounded-[24px]">
              <CardHeader className="p-6 border-b border-[#eef4ff]/30">
                <CardTitle className="flex items-center gap-2 text-base font-extrabold text-slate-900">
                  <HugeiconsIcon icon={CreditCardIcon} size={18} strokeWidth={1.5} className="text-[#0037b0]" />
                  Payments
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                {invoice.payments && invoice.payments.length > 0 ? (
                  <div className="relative border-l border-slate-200/60 pl-5 ml-2.5 space-y-5 py-1">
                    {invoice.payments.map((payment) => (
                      <div 
                        key={payment.id} 
                        className="relative rounded-2xl border border-[#eef4ff]/40 bg-[#f8f9ff]/50 p-4 shadow-[0px_4px_12px_rgba(0,55,176,0.01)] hover:bg-[#eef4ff]/20 transition-all duration-200"
                      >
                        {/* Dot indicator on timeline */}
                        <span className="absolute -left-[25.5px] top-6 flex h-2 w-2 items-center justify-center rounded-full bg-emerald-500 ring-4 ring-white shadow-sm" />
                        
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-extrabold text-emerald-600 text-base tabular-nums">
                              +{formatCurrency(payment.amount)}
                            </p>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">
                              {payment.paymentMethod.replace('_', ' ')}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] font-bold text-slate-400 tabular-nums">
                              {formatDate(payment.paymentDate)}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 rounded-lg hover:bg-slate-200/55 flex items-center justify-center cursor-pointer"
                              onClick={() => downloadReceipt(payment.id)}
                              disabled={downloadingReceiptId === payment.id}
                            >
                              <HugeiconsIcon icon={Download02Icon} size={14} className="text-slate-500" strokeWidth={1.5} />
                            </Button>
                          </div>
                        </div>
                        {payment.reference && (
                          <div className="mt-2.5 pt-2 border-t border-slate-200/40">
                            <p className="text-[10px] font-semibold text-slate-400">
                              Ref: <span className="font-bold text-slate-600">{payment.reference}</span>
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center bg-[#f8f9ff]/50 rounded-[20px] border border-dashed border-[#eef4ff]/60">
                    <p className="text-sm font-semibold text-slate-400">No payments yet</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>

      {/* Generate Payment Link Modal */}
      <Modal
        isOpen={isPaymentLinkModalOpen}
        onClose={() => setIsPaymentLinkModalOpen(false)}
        title="Generate Payment Link"
        description="Create a Paystack payment link for this invoice"
      >
        {!organization?.isPaystackVerified ? (
          <div className="space-y-4">
            <div className="flex gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
              <HugeiconsIcon icon={AlertDiamondIcon} size={20} className="shrink-0 text-amber-600 mt-0.5" strokeWidth={1.5} />
              <div className="space-y-1">
                <p className="text-sm font-medium">Paystack not set up</p>
                <p className="text-sm text-muted-foreground">
                  You need to connect your Paystack account before you can generate payment links.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <Link to="/settings/paystack" onClick={() => setIsPaymentLinkModalOpen(false)}>
                <Button>Go to Paystack Settings</Button>
              </Link>
              <Button variant="outline" onClick={() => setIsPaymentLinkModalOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const formData = new FormData(e.currentTarget)
              const amount = parseFloat(formData.get('amount') as string)
              if (amount <= 0) {
                toast.error('Amount must be greater than 0')
                return
              }
              if (amount > outstanding) {
                toast.error('Amount cannot exceed outstanding balance')
                return
              }
              generateLinkMutation.mutate({
                email: formData.get('email') as string,
                amount,
              })
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="linkEmail" required>Customer Email</Label>
              <Input
                id="linkEmail"
                name="email"
                type="email"
                placeholder="customer@example.com"
                defaultValue={invoice.client.email || ''}
                required
              />
              <p className="text-xs text-muted-foreground">
                Paystack will send a receipt to this email
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="linkAmount" required>Amount</Label>
              <Input
                id="linkAmount"
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                max={outstanding}
                defaultValue={outstanding}
                required
              />
              <p className="text-xs text-muted-foreground">
                Outstanding balance: {formatCurrency(outstanding)}
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit" isLoading={generateLinkMutation.isPending}>
                Generate Link
              </Button>
              <Button type="button" variant="outline" onClick={() => setIsPaymentLinkModalOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Record Payment Modal */}
      <Modal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        title="Record Payment"
        description={`Recording payment for ${invoice.invoiceNumber}`}
      >
        <form onSubmit={handleSubmit(onSubmitPayment)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount" required>Amount</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              {...register('amount', { valueAsNumber: true })}
              error={errors.amount?.message}
            />
            <p className="text-xs text-muted-foreground">
              Outstanding: {formatCurrency(outstanding)}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="paymentMethod" required>Payment Method</Label>
              <Select
                id="paymentMethod"
                {...register('paymentMethod')}
                error={errors.paymentMethod?.message}
              >
                <option value="CASH">Cash</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="CARD">Card</option>
                <option value="OTHER">Other</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentDate" required>Payment Date</Label>
              <Input
                id="paymentDate"
                type="date"
                {...register('paymentDate')}
                error={errors.paymentDate?.message}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reference">Reference</Label>
            <Input
              id="reference"
              placeholder="Transaction reference..."
              {...register('reference')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Additional notes..."
              {...register('notes')}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" isLoading={paymentMutation.isPending}>
              Record Payment
            </Button>
            <Button type="button" variant="outline" onClick={() => setIsPaymentModalOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
