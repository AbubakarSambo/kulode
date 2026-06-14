import { useState, useEffect } from 'react'
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

  Notification03Icon,
  Copy01Icon,
  ArrowDown01Icon,
  Invoice03Icon,
  ArrowLeft02Icon,
  MoreVerticalIcon,
} from '@hugeicons/core-free-icons'

function MailIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  )
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="18" x2="16" y2="18" />
    </svg>
  )
}

import { Header } from '@/components/layout'
import { Button, Input, Label, Select, Textarea, Card, CardContent, CardHeader, CardTitle, ConfirmDialog, DropdownPanel } from '@/components/ui'
import { Modal } from '@/components/shared/Modal'
import { invoicesApi, paymentsApi, organizationsApi } from '@/api'
import apiClient from '@/api/client'
import type { ApiResponse } from '@/types'
import { formatCurrency, formatDate, cn, formatAmountInput, parseAmountInput } from '@/lib/utils'
import { posthog } from '@/lib/posthog'
import type { InvoiceStatus, PaymentMethod } from '@/types'
import { useAuthStore } from '@/stores/auth'


const renderStatusPill = (status: InvoiceStatus) => {
  const configs: Record<InvoiceStatus, { dot: string; text: string; label: string }> = {
    PAID: {
      dot: 'bg-emerald-500',
      text: 'text-emerald-700',
      label: 'Paid',
    },
    OVERDUE: {
      dot: 'bg-rose-500',
      text: 'text-rose-700',
      label: 'Overdue',
    },
    PARTIALLY_PAID: {
      dot: 'bg-amber-500',
      text: 'text-amber-700',
      label: 'Part Paid',
    },
    SENT: {
      dot: 'bg-blue-500',
      text: 'text-blue-700',
      label: 'Sent',
    },
    DRAFT: {
      dot: 'bg-slate-400',
      text: 'text-slate-550',
      label: 'Draft',
    },
    CANCELLED: {
      dot: 'bg-slate-400',
      text: 'text-slate-550',
      label: 'Cancelled',
    },
  }

  const config = configs[status]
  return (
    <div className="flex items-center gap-1.5 select-none justify-start">
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", config.dot)} />
      <span className={cn("text-xs font-semibold tracking-wide", config.text)}>
        {config.label}
      </span>
    </div>
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
  const [linkAmountStr, setLinkAmountStr] = useState('')
  const [recordAmountStr, setRecordAmountStr] = useState('')
  const [downloadingReceiptId, setDownloadingReceiptId] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(true)
  const [lifecycleOpen, setLifecycleOpen] = useState(false)
  const [isFabMenuOpen, setIsFabMenuOpen] = useState(false)
  const [isMoreDropdownOpen, setIsMoreDropdownOpen] = useState(false)

  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoices', id],
    queryFn: () => invoicesApi.get(id!),
    enabled: !!id,
    staleTime: 30_000,
  })

  const outstanding = invoice ? Math.max(0, Number(invoice.total) - Number(invoice.amountPaid)) : 0

  const { data: organization } = useQuery({
    queryKey: ['organization'],
    queryFn: () => organizationsApi.getCurrent(),
  })

  const sendMutation = useMutation({
    mutationFn: () => invoicesApi.send(id!),
    onSuccess: () => {
      queryClient.setQueryData(['invoices', id], (old: typeof invoice) =>
        old ? { ...old, status: 'SENT' as const } : old
      )
      queryClient.invalidateQueries({ queryKey: ['invoices'], exact: false, refetchType: 'none' })
      posthog.capture('invoice_sent', { invoice_id: id })
      toast.success('Invoice sent', { description: 'Invoice has been marked as sent' })
    },
  })

  const cancelMutation = useMutation({
    mutationFn: () => invoicesApi.cancel(id!),
    onSuccess: () => {
      queryClient.setQueryData(['invoices', id], (old: typeof invoice) =>
        old ? { ...old, status: 'CANCELLED' as const } : old
      )
      queryClient.invalidateQueries({ queryKey: ['invoices'], exact: false, refetchType: 'none' })
      posthog.capture('invoice_cancelled', { invoice_id: id })
      toast.success('Invoice cancelled')
    },
  })

  const reminderMutation = useMutation({
    mutationFn: () => invoicesApi.sendReminder(id!),
    onSuccess: () => {
      posthog.capture('invoice_reminder_sent', { invoice_id: id })
      toast.success('Reminder sent', { description: 'Payment reminder has been sent to the client' })
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (error: any) => {
      toast.error('Failed to send reminder', { description: error.response?.data?.message || 'Please try again' })
    },
  })

  const duplicateMutation = useMutation({
    mutationFn: () => invoicesApi.duplicate(id!),
    onSuccess: (newInvoice) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      posthog.capture('invoice_duplicated', { original_id: id, new_id: newInvoice.id })
      toast.success('Invoice duplicated', { description: `Created ${newInvoice.invoiceNumber}` })
      navigate(`/invoices/${newInvoice.id}`)
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (error: any) => {
      toast.error('Failed to duplicate invoice', { description: error.response?.data?.message || 'Please try again' })
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
    setValue,
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

  useEffect(() => {
    if (isPaymentLinkModalOpen && outstanding !== undefined) {
      setLinkAmountStr(formatAmountInput(outstanding))
    }
  }, [isPaymentLinkModalOpen, outstanding])

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
    setDeleteConfirmOpen(true)
  }

  const openPaymentModal = () => {
    if (invoice) {
      const initialAmount = Number(invoice.total) - Number(invoice.amountPaid)
      reset({
        amount: initialAmount,
        paymentMethod: 'BANK_TRANSFER',
        paymentDate: new Date().toISOString().split('T')[0],
        reference: '',
        notes: '',
      })
      setRecordAmountStr(formatAmountInput(initialAmount))
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

  const isSuperAdmin = user?.role === 'SUPER_ADMIN'
  const canRecordPayment = invoice.status !== 'DRAFT' && invoice.status !== 'CANCELLED' && invoice.status !== 'PAID'
  const canSend = invoice.status === 'DRAFT'
  const canCancel = invoice.status !== 'PAID' && invoice.status !== 'CANCELLED'
  const canDelete = isSuperAdmin || invoice.status === 'DRAFT'
  const canGenerateLink = invoice.status !== 'CANCELLED' && invoice.status !== 'PAID'
  const hasPaymentLink = !!invoice.paymentUrl

  const copyPaymentLink = () => {
    if (invoice?.shareToken) {
      const publicUrl = `${window.location.origin}/i/${invoice.shareToken}`
      navigator.clipboard.writeText(publicUrl)
      posthog.capture('payment_link_copied', { invoice_id: id })
      toast.success('Invoice link copied to clipboard')
    } else {
      toast.error('Invoice is in DRAFT. Please mark as sent first.')
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

  const shareWhatsApp = async () => {
    if (!invoice) return
    const baseOrigin = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1')
      ? 'https://pay.tari1.app'
      : window.location.origin
    const publicUrl = invoice.shareToken ? `${baseOrigin}/i/${invoice.shareToken}` : null
    let displayUrl = publicUrl
    if (publicUrl) {
      try {
        const res = await apiClient.get<{ url: string }>('/invoices/public/shorten', { params: { url: publicUrl } })
        if (res.data && res.data.url) {
          displayUrl = res.data.url
        }
      } catch {
        // fallback
      }
    }

    const orgName = organization?.name || 'Us'
    const dueStr = invoice.dueDate ? formatDate(invoice.dueDate) : 'soon'
    const clientGreeting = invoice.client?.name ? `Hi ${invoice.client.name.split(' ')[0]}` : 'Hi there'

    const lines = [
      `${clientGreeting} 👋`,
      ``,
      `Please find your invoice from *${orgName}* below:`,
      ``,
      `📄 *Invoice:* ${invoice.invoiceNumber}`,
      `💰 *Amount Due:* ${formatCurrency(invoice.total)}`,
      `📅 *Due Date:* ${dueStr}`,
      ...(displayUrl ? [
        ``,
        `🔗 *View & Pay Online:*`,
        displayUrl,
        ``,
        `Via the link above you can:`,
        `✅ View the full invoice details`,
        `🏦 Pay by *bank transfer* (recommended — no card needed)`,
        `💳 Or pay by *card* via Paystack`,
        `📥 Download your invoice or receipt`,
        ``,
        `If you have any questions, feel free to reach out. Thank you for your business! 🙏`,
      ] : [
        ``,
        `Please reach out to process your payment.`,
      ])
    ]

    const text = lines.join('\n')
    const cleanPhone = invoice.client?.phone ? invoice.client.phone.replace(/\D/g, '') : ''
    const url = cleanPhone
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(text)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`
    window.open(url, '_blank')
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

  // Define Stepper Timeline Content
  const stepperContent = (
    <div className="relative pl-6 border-l border-slate-100/50 space-y-6 ml-3">
      {/* Step 1: Draft */}
      <div className="relative">
        <span className="absolute -left-[32px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white text-[9px] font-bold shadow-sm">✓</span>
        <div>
          <p className="text-xs font-bold text-slate-800">Draft Created</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Initialized on {formatDate(invoice.createdAt)}</p>
        </div>
      </div>

      {/* Step 2: Sent */}
      <div className="relative">
        {invoice.status !== 'DRAFT' ? (
          <span className="absolute -left-[32px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white text-[9px] font-bold shadow-sm">✓</span>
        ) : (
          <span className="absolute -left-[32px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-slate-450 text-[9px] font-bold shadow-sm">•</span>
        )}
        <div>
          <p className={cn("text-xs font-bold", invoice.status !== 'DRAFT' ? "text-slate-800" : "text-slate-450")}>Sent to Client</p>
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
          <span className="absolute -left-[32px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-slate-450 text-[9px] font-bold shadow-sm">•</span>
        )}
        <div>
          <p className={cn(
            "text-xs font-bold",
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
  )

  // Define Reusable Physical Invoice Sheet Markup
  const invoiceSheetContent = (
    <div className="relative overflow-hidden">
      {/* Document Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-8 mt-2 pb-6 border-b border-[#eef4ff]/40">
        <div>
          <h2 className="text-sm font-bold tracking-tight text-slate-800 uppercase">
            {organization?.name || 'Acme Corporation'}
          </h2>
          <p className="text-[11px] text-slate-400 mt-1">Corporate Invoice</p>
        </div>
        <div className="sm:text-right">
          <span className="text-[9px] font-bold uppercase tracking-widest text-[#0037b0] bg-[#0037b0]/5 px-2.5 py-1 rounded-md">
            INVOICE
          </span>
          <h1 className="text-lg font-bold tracking-tight text-slate-900 mt-2">{invoice.invoiceNumber}</h1>
        </div>
      </div>

      {/* Bilateral Details Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
        <div className="bg-background/50 p-4.5 rounded-2xl border border-[#eef4ff]/30">
          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 block mb-2">Billed To</span>
          <Link to={`/clients/${invoice.client.id}`} className="text-sm font-bold text-[#0037b0] hover:underline block truncate max-w-[280px]">
            {invoice.client.name}
          </Link>
          {invoice.client.email && (
            <span className="text-xs text-slate-500 block mt-1 truncate max-w-[280px]">{invoice.client.email}</span>
          )}
          {invoice.client.phone && (
            <span className="text-xs text-slate-500 block mt-0.5">{invoice.client.phone}</span>
          )}
        </div>
        <div className="bg-background/50 p-4.5 rounded-2xl border border-[#eef4ff]/30 sm:text-right flex flex-col justify-between gap-3">
          <div>
            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 block mb-0.5">Issue Date</span>
            <span className="text-xs font-bold text-slate-750">{formatDate(invoice.issueDate)}</span>
          </div>
          <div>
            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 block mb-0.5">Due Date</span>
            <span className="text-xs font-bold text-rose-600">{formatDate(invoice.dueDate)}</span>
          </div>
        </div>
      </div>

      {/* Line Items - Desktop Table / Mobile Vertical List */}
      <div className="pt-2">
        {/* Desktop Table View */}
        <div className="hidden sm:block overflow-x-auto">
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
                    index % 2 === 0 ? "bg-transparent" : "bg-background/30"
                  )}
                >
                  <td className="py-4 text-sm font-medium text-slate-800">{item.description}</td>
                  <td className="py-4 text-right text-sm font-medium text-slate-650 tabular-nums">{item.quantity}</td>
                  <td className="py-4 text-right text-sm font-medium text-slate-650 tabular-nums">{formatCurrency(item.unitPrice)}</td>
                  <td className="py-4 text-right text-sm font-bold text-slate-900 tabular-nums">{formatCurrency(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Vertical List View (Fits large text / prices with NO horizontal scroll) */}
        <div className="block sm:hidden space-y-3.5 pb-4">
          <p className="text-[9px] font-bold tracking-widest text-slate-450 uppercase mb-2">Invoice Items</p>
          {invoice.items.map((item, index) => (
            <div 
              key={index}
              className="p-4 rounded-2xl bg-background/40 border border-[#eef4ff]/20 flex flex-col gap-2"
            >
              <p className="text-xs font-bold text-slate-700 leading-tight">
                {item.description}
              </p>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-450 font-semibold">
                  {item.quantity} x {formatCurrency(item.unitPrice)}
                </span>
                <span className="font-bold text-slate-850 tabular-nums">
                  {formatCurrency(item.amount)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Totals Section */}
        <table className="w-full border-t border-[#eef4ff]/50">
          <tbody className="divide-y-0">
            <tr>
              <td className="py-3 text-left sm:text-right text-xs font-bold uppercase tracking-wider text-slate-400 sm:pr-32">Subtotal</td>
              <td className="py-3 text-right text-sm font-bold text-slate-900 tabular-nums w-32">{formatCurrency(invoice.subtotal)}</td>
            </tr>
            {Number(invoice.discountAmount) > 0 && (
              <tr className="text-emerald-600">
                <td className="py-1.5 text-left sm:text-right text-xs font-bold uppercase tracking-wider sm:pr-32">Discount ({invoice.discountPercent}%)</td>
                <td className="py-1.5 text-right text-sm font-bold tabular-nums w-32">-{formatCurrency(invoice.discountAmount ?? 0)}</td>
              </tr>
            )}
            {Number(invoice.taxAmount) > 0 && (
              <tr className="text-slate-500">
                <td className="py-1.5 text-left sm:text-right text-xs font-bold uppercase tracking-wider text-slate-400 sm:pr-32">VAT ({invoice.taxRate ?? 7.5}%)</td>
                <td className="py-1.5 text-right text-sm font-semibold text-slate-705 tabular-nums w-32">{formatCurrency(invoice.taxAmount)}</td>
              </tr>
            )}
            <tr className="border-t border-[#eef4ff]/60 bg-[#0037b0]/02">
              <td className="py-4 text-left sm:text-right text-xs font-bold uppercase tracking-wider text-slate-700 sm:pr-32">Total</td>
              <td className="py-4 text-right text-lg font-bold text-slate-900 tabular-nums w-32">{formatCurrency(invoice.total)}</td>
            </tr>
            {Number(invoice.amountPaid) > 0 && (
              <>
                <tr className="text-emerald-600">
                  <td className="py-2 text-left sm:text-right text-xs font-bold uppercase tracking-wider sm:pr-32">Paid</td>
                  <td className="py-2 text-right text-sm font-bold tabular-nums w-32">-{formatCurrency(invoice.amountPaid)}</td>
                </tr>
                <tr className="font-bold border-t border-dashed border-slate-200">
                  <td className="py-3 text-left sm:text-right text-xs font-bold uppercase tracking-wider text-slate-700 sm:pr-32">Balance Due</td>
                  <td className="py-3 text-right text-base font-bold text-slate-900 tabular-nums w-32">{formatCurrency(outstanding)}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Notes */}
      {invoice.notes && (
        <div className="border-t border-[#eef4ff]/30 pt-4 mt-8">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Notes</p>
          <p className="mt-2 text-xs font-medium text-slate-600 leading-relaxed bg-background/50 p-4 rounded-xl border border-[#eef4ff]/30">{invoice.notes}</p>
        </div>
      )}
    </div>
  )

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background">
      <Header
        title={invoice.invoiceNumber}
        description={`Invoice for ${invoice.client.name}`}
        category={
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            <Link to="/invoices" className="hover:text-[#0037b0] transition-colors">Invoices</Link>
            <span className="text-slate-300">/</span>
            <span className="text-[#0037b0]">Detail</span>
          </div>
        }
        action={
          <div className="flex items-center gap-2">
            {canSend && (
              <Button 
                onClick={() => sendMutation.mutate()} 
                className="h-10 px-4 rounded-xl bg-gradient-to-r from-[#0037b0] to-[#1d4ed8] text-white shadow-[0px_4px_12px_rgba(0,55,176,0.15)] hover:opacity-95 text-xs font-semibold select-none"
              >
                <HugeiconsIcon icon={SentIcon} size={16} className="mr-2" strokeWidth={1.5} />
                Mark as Sent
              </Button>
            )}
            {canRecordPayment && (
              <Button 
                onClick={openPaymentModal} 
                className="h-10 px-4 rounded-xl bg-gradient-to-r from-[#0037b0] to-[#1d4ed8] text-white shadow-[0px_4px_12px_rgba(0,55,176,0.15)] hover:opacity-95 text-xs font-semibold select-none"
              >
                <HugeiconsIcon icon={PlusSignIcon} size={16} className="mr-2" strokeWidth={1.5} />
                Record Payment
              </Button>
            )}
            <Button 
              variant="outline" 
              onClick={downloadPdf} 
              className="h-10 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors text-xs font-semibold"
            >
              <HugeiconsIcon icon={Download02Icon} size={16} className="mr-2" strokeWidth={1.5} />
              PDF
            </Button>
            {invoice.status !== 'DRAFT' && (
              <Button 
                variant="outline" 
                onClick={shareWhatsApp} 
                className="h-10 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors text-xs font-semibold"
              >
                <WhatsAppIcon className="mr-2 h-4 w-4" />
                Share
              </Button>
            )}

            <div className="relative inline-block text-left">
              <Button
                variant="outline"
                onClick={() => setIsMoreDropdownOpen(!isMoreDropdownOpen)}
                className="h-10 w-10 p-0 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors flex items-center justify-center cursor-pointer"
                aria-label="More actions"
              >
                <HugeiconsIcon icon={MoreVerticalIcon} size={16} strokeWidth={1.5} />
              </Button>

              <DropdownPanel
                isOpen={isMoreDropdownOpen}
                onClose={() => setIsMoreDropdownOpen(false)}
                align="right"
                widthClass="w-56"
                zIndexClass="z-50"
              >
                {canGenerateLink && !hasPaymentLink && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMoreDropdownOpen(false)
                      setIsPaymentLinkModalOpen(true)
                    }}
                    className="w-full text-left px-3.5 py-2.5 text-xs font-semibold rounded-lg text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <HugeiconsIcon icon={Link02Icon} size={14} strokeWidth={1.5} />
                    Generate Payment Link
                  </button>
                )}

                {invoice.status !== 'DRAFT' && invoice.shareToken && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setIsMoreDropdownOpen(false)
                        copyPaymentLink()
                      }}
                      className="w-full text-left px-3.5 py-2.5 text-xs font-semibold rounded-lg text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2 cursor-pointer"
                    >
                      <HugeiconsIcon icon={CopyIcon} size={14} strokeWidth={1.5} />
                      Copy Link
                    </button>
                    <a
                      href={`/i/${invoice.shareToken}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full text-left px-3.5 py-2.5 text-xs font-semibold rounded-lg text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2 cursor-pointer"
                      onClick={() => setIsMoreDropdownOpen(false)}
                    >
                      <HugeiconsIcon icon={Share02Icon} size={14} strokeWidth={1.5} />
                      Open Link
                    </a>
                  </>
                )}

                {(invoice.status === 'SENT' || invoice.status === 'OVERDUE') && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMoreDropdownOpen(false)
                      reminderMutation.mutate()
                    }}
                    disabled={reminderMutation.isPending}
                    className="w-full text-left px-3.5 py-2.5 text-xs font-semibold rounded-lg text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <HugeiconsIcon icon={Notification03Icon} size={14} strokeWidth={1.5} />
                    Send Reminder
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setIsMoreDropdownOpen(false)
                    duplicateMutation.mutate()
                  }}
                  disabled={duplicateMutation.isPending}
                  className="w-full text-left px-3.5 py-2.5 text-xs font-semibold rounded-lg text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={1.5} />
                  Duplicate
                </button>

                {canCancel && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMoreDropdownOpen(false)
                      cancelMutation.mutate()
                    }}
                    className="w-full text-left px-3.5 py-2.5 text-xs font-semibold rounded-lg text-rose-600 hover:bg-rose-50 transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.5} />
                    Cancel Invoice
                  </button>
                )}

                {canDelete && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMoreDropdownOpen(false)
                      handleDelete()
                    }}
                    className="w-full text-left px-3.5 py-2.5 text-xs font-semibold rounded-lg text-rose-600 hover:bg-rose-50 transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={1.5} />
                    Delete Invoice
                  </button>
                )}
              </DropdownPanel>
            </div>
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-7xl">
          {/* Mobile Back Navigation & Actions Header */}
          <div className="flex items-center justify-between mb-4 sm:hidden relative z-30">
            <Link to="/invoices" className="inline-flex items-center text-xs font-semibold text-[#0037b0] hover:underline gap-1 min-h-[44px]">
              <HugeiconsIcon icon={ArrowLeft02Icon} size={16} />
              Back to Invoices
            </Link>

            <div className="relative inline-block text-left">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsMoreDropdownOpen(!isMoreDropdownOpen)}
                className="h-9 w-9 p-0 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors flex items-center justify-center cursor-pointer"
                aria-label="More actions"
              >
                <HugeiconsIcon icon={MoreVerticalIcon} size={15} strokeWidth={1.5} />
              </Button>

              <DropdownPanel
                isOpen={isMoreDropdownOpen}
                onClose={() => setIsMoreDropdownOpen(false)}
                align="right"
                widthClass="w-52"
                zIndexClass="z-50"
              >
                {canGenerateLink && !hasPaymentLink && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMoreDropdownOpen(false)
                      setIsPaymentLinkModalOpen(true)
                    }}
                    className="w-full text-left px-3.5 py-2.5 text-xs font-semibold rounded-lg text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <HugeiconsIcon icon={Link02Icon} size={14} strokeWidth={1.5} />
                    Generate Payment Link
                  </button>
                )}

                {invoice.status !== 'DRAFT' && invoice.shareToken && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setIsMoreDropdownOpen(false)
                        copyPaymentLink()
                      }}
                      className="w-full text-left px-3.5 py-2.5 text-xs font-semibold rounded-lg text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2 cursor-pointer"
                    >
                      <HugeiconsIcon icon={CopyIcon} size={14} strokeWidth={1.5} />
                      Copy Link
                    </button>
                    <a
                      href={`/i/${invoice.shareToken}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full text-left px-3.5 py-2.5 text-xs font-semibold rounded-lg text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2 cursor-pointer"
                      onClick={() => setIsMoreDropdownOpen(false)}
                    >
                      <HugeiconsIcon icon={Share02Icon} size={14} strokeWidth={1.5} />
                      Open Link
                    </a>
                  </>
                )}

                {(invoice.status === 'SENT' || invoice.status === 'OVERDUE') && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMoreDropdownOpen(false)
                      reminderMutation.mutate()
                    }}
                    disabled={reminderMutation.isPending}
                    className="w-full text-left px-3.5 py-2.5 text-xs font-semibold rounded-lg text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <HugeiconsIcon icon={Notification03Icon} size={14} strokeWidth={1.5} />
                    Send Reminder
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setIsMoreDropdownOpen(false)
                    duplicateMutation.mutate()
                  }}
                  disabled={duplicateMutation.isPending}
                  className="w-full text-left px-3.5 py-2.5 text-xs font-semibold rounded-lg text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={1.5} />
                  Duplicate
                </button>

                {canCancel && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMoreDropdownOpen(false)
                      cancelMutation.mutate()
                    }}
                    className="w-full text-left px-3.5 py-2.5 text-xs font-semibold rounded-lg text-rose-600 hover:bg-rose-50 transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.5} />
                    Cancel Invoice
                  </button>
                )}

                {canDelete && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMoreDropdownOpen(false)
                      handleDelete()
                    }}
                    className="w-full text-left px-3.5 py-2.5 text-xs font-semibold rounded-lg text-rose-600 hover:bg-rose-50 transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={1.5} />
                    Delete Invoice
                  </button>
                )}
              </DropdownPanel>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* LEFT COLUMN: THE PHYSICAL INVOICE SHEET - Sits 2nd on mobile */}
            {/* Desktop Direct Render */}
            <div className="hidden lg:block lg:col-span-8 bg-white rounded-3xl p-6 sm:p-10 shadow-[0px_16px_48px_rgba(0,55,176,0.08)] border border-[#eef4ff]/50 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#0037b0] to-[#1d4ed8]" />
              {invoiceSheetContent}
            </div>

            {/* Mobile collapsible Invoice Sheet */}
            <div className="block lg:hidden order-2 bg-white rounded-3xl shadow-[0px_12px_32px_rgba(0,55,176,0.08)] border border-[#eef4ff]/50 overflow-hidden">
              <button
                onClick={() => setSheetOpen(!sheetOpen)}
                className="w-full flex items-center justify-between p-5 text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors cursor-pointer min-h-[44px]"
              >
                <div className="flex items-center gap-2">
                  <HugeiconsIcon icon={Invoice03Icon} size={16} className="text-[#0037b0]" strokeWidth={1.5} />
                  <span className="tracking-wider text-[10px] font-bold text-slate-400">INVOICE SHEET DETAILS</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-slate-700 text-xs">{formatCurrency(invoice.total)}</span>
                  <HugeiconsIcon
                    icon={ArrowDown01Icon}
                    size={16}
                    className={cn("transition-transform duration-200 text-slate-400", sheetOpen && "rotate-180")}
                  />
                </div>
              </button>

              <div className={cn(
                "overflow-hidden transition-all duration-300 ease-in-out",
                sheetOpen ? "max-h-[1500px] opacity-100 p-5 border-t border-[#eef4ff]/30" : "max-h-0 opacity-0"
              )}>
                {invoiceSheetContent}
              </div>
            </div>

            {/* RIGHT COLUMN: WORKSPACE SIDEBAR PANEL - Sits 1st on mobile */}
            <div className="lg:col-span-4 order-1 lg:order-2 space-y-6">
              {/* Ledger Summary Stats (Permanently visible at the top) */}
              <div className="bg-gradient-to-br from-white to-[#f8f9ff]/50 rounded-3xl p-6 shadow-[0px_12px_32px_rgba(0,55,176,0.06)] border border-[#0037b0]/8 space-y-4 relative overflow-hidden">
                {/* Background radial glow */}
                <div className="absolute -top-16 -right-16 w-32 h-32 rounded-full bg-[#0037b0]/5 blur-2xl pointer-events-none" />

                <h3 className="text-xs font-bold uppercase tracking-widest text-[#0037b0]/80 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#0037b0]" />
                  Ledger Overview
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-background/50 p-4 rounded-2xl border border-[#eef4ff]/30">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Total Billed</span>
                    <p className="text-sm font-bold text-slate-700 mt-1 tabular-nums">{formatCurrency(invoice.total)}</p>
                  </div>
                  <div className="bg-background/50 p-4 rounded-2xl border border-[#eef4ff]/30">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Paid To Date</span>
                    <p className="text-sm font-bold text-emerald-600 mt-1 tabular-nums">{formatCurrency(invoice.amountPaid)}</p>
                  </div>
                </div>
                
                {/* Progress bar for partial payments */}
                {Number(invoice.amountPaid) > 0 && (
                  <div className="space-y-2 pt-3 border-t border-[#eef4ff]/30">
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

                {/* Invoice Lifecycle Timeline Accordion Header */}
                <div className="flex justify-between items-center pt-3 border-t border-[#eef4ff]/30">
                  <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Invoice Lifecycle</span>
                  <button
                    onClick={() => setLifecycleOpen(!lifecycleOpen)}
                    className="flex items-center gap-1 text-[#0037b0] hover:text-[#1d4ed8] text-[10px] font-bold cursor-pointer transition-colors min-h-[32px] px-2 -mr-2 hover:bg-slate-50 rounded-lg"
                  >
                    <span>{lifecycleOpen ? "Hide Timeline" : "Show Timeline"}</span>
                    <HugeiconsIcon icon={ArrowDown01Icon} size={12} className={cn("transition-transform duration-200", lifecycleOpen && "rotate-180")} />
                  </button>
                </div>

                {/* Collapsible Timeline Content */}
                <div className={cn(
                  "overflow-hidden transition-all duration-300 ease-in-out pl-1.5",
                  lifecycleOpen ? "max-h-[300px] opacity-100 py-3 border-t border-[#eef4ff]/30" : "max-h-0 opacity-0"
                )}>
                  {stepperContent}
                </div>

                <div className={cn(
                  "p-4 rounded-2xl flex justify-between items-center",
                  outstanding > 0 ? "bg-rose-50/20 text-rose-950" : "bg-emerald-50/20 text-emerald-950"
                )}>
                  <div>
                    <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Balance Due</span>
                    <p className="text-base font-bold tracking-tight mt-0.5 tabular-nums">{formatCurrency(outstanding)}</p>
                  </div>
                  {renderStatusPill(invoice.status)}
                </div>
              </div>

              {/* Payments Ledger Card */}
              <Card className="border-0 shadow-[0px_12px_32px_rgba(0,55,176,0.08)] bg-white rounded-[24px]">
                <CardHeader className="p-6 border-b border-[#eef4ff]/30">
                  <CardTitle className="flex items-center gap-2 text-base font-bold text-slate-900">
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
                          className="relative rounded-2xl border border-[#eef4ff]/40 bg-background/50 p-4 shadow-[0px_4px_12px_rgba(0,55,176,0.01)] hover:bg-[#eef4ff]/20 transition-all duration-200"
                        >
                          {/* Dot indicator on timeline */}
                          <span className="absolute -left-[25.5px] top-6 flex h-2 w-2 items-center justify-center rounded-full bg-emerald-500 ring-4 ring-white shadow-sm" />
                          
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-bold text-emerald-600 text-base tabular-nums">
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
                                Ref: <span className="font-bold text-slate-650">{payment.reference}</span>
                              </p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-8 text-center bg-background/50 rounded-[20px] border border-dashed border-[#eef4ff]/60">
                      <p className="text-sm font-semibold text-slate-400">No payments yet</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Floating Action Button Menu (Speed Dial) */}
      <div className="fixed bottom-28 right-6 z-40 sm:hidden flex flex-col items-end gap-3.5">
        {/* Backdrop (visible only when menu is open) */}
        {isFabMenuOpen && (
          <div 
            onClick={() => setIsFabMenuOpen(false)}
            className="fixed inset-0 bg-slate-900/35 backdrop-blur-[2px] z-30 transition-all duration-300"
          />
        )}

        {/* Speed Dial Menu Items */}
        <div className={cn(
          "flex flex-col items-end gap-3.5 z-40 transition-all duration-300 origin-bottom",
          isFabMenuOpen ? "scale-100 opacity-100 translate-y-0 pointer-events-auto" : "scale-75 opacity-0 translate-y-4 pointer-events-none"
        )}>
          {/* Action: Record Payment */}
          {canRecordPayment && (
            <div className="flex items-center gap-2.5">
              <span className="bg-slate-900/80 text-white text-[10px] font-bold px-2.5 py-1 rounded-md shadow-sm">
                Record Payment
              </span>
              <button 
                onClick={() => {
                  setIsFabMenuOpen(false)
                  openPaymentModal()
                }} 
                className="w-11 h-11 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-md active:scale-95 transition-transform cursor-pointer"
                aria-label="Record Payment"
              >
                <HugeiconsIcon icon={PlusSignIcon} size={18} strokeWidth={1.5} />
              </button>
            </div>
          )}

          {/* Action: Send via Email */}
          <div className="flex items-center gap-2.5">
            <span className="bg-slate-900/80 text-white text-[10px] font-bold px-2.5 py-1 rounded-md shadow-sm">
              Send Email
            </span>
            <button 
              onClick={() => {
                setIsFabMenuOpen(false)
                sendMutation.mutate()
              }} 
              className="w-11 h-11 rounded-full bg-[#0037b0] text-white flex items-center justify-center shadow-md active:scale-95 transition-transform cursor-pointer"
              aria-label="Send via Email"
            >
              <MailIcon className="h-4.5 w-4.5" />
            </button>
          </div>

          {/* Action: Share via WhatsApp */}
          <div className="flex items-center gap-2.5">
            <span className="bg-slate-900/80 text-white text-[10px] font-bold px-2.5 py-1 rounded-md shadow-sm">
              WhatsApp Link
            </span>
            <button 
              onClick={() => {
                setIsFabMenuOpen(false)
                shareWhatsApp()
              }} 
              className="w-11 h-11 rounded-full bg-[#25D366] text-white flex items-center justify-center shadow-md active:scale-95 transition-transform cursor-pointer"
              aria-label="WhatsApp Link"
            >
              <WhatsAppIcon className="h-4.5 w-4.5" />
            </button>
          </div>

        </div>

        {/* Main Trigger Button */}
        <button 
          onClick={() => setIsFabMenuOpen(!isFabMenuOpen)} 
          className="w-14 h-14 rounded-full bg-gradient-to-br from-[#0037b0] to-[#1d4ed8] text-white flex items-center justify-center shadow-[0px_8px_24px_rgba(0,55,176,0.25)] hover:scale-105 active:scale-95 transition-all z-40 cursor-pointer"
          aria-label="Toggle Actions Menu"
        >
          {isFabMenuOpen ? (
            <HugeiconsIcon 
              icon={Cancel01Icon} 
              size={24} 
              strokeWidth={1.5} 
              className="transition-transform duration-200 rotate-90"
            />
          ) : (
            <MenuIcon className="h-6 w-6" />
          )}
        </button>
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
              const amount = parseAmountInput(formData.get('amount') as string)
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
                type="text"
                value={linkAmountStr}
                onChange={(e) => {
                  setLinkAmountStr(formatAmountInput(e.target.value))
                }}
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
              type="text"
              value={recordAmountStr}
              onChange={(e) => {
                const val = e.target.value
                const formatted = formatAmountInput(val)
                setRecordAmountStr(formatted)
                setValue('amount', parseAmountInput(formatted), { shouldValidate: true })
              }}
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

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={() => {
          deleteMutation.mutate(undefined, {
            onSuccess: () => {
              setDeleteConfirmOpen(false)
            }
          })
        }}
        title="Delete Invoice"
        description={`Are you sure you want to delete invoice ${invoice.invoiceNumber}? This action cannot be undone and will delete all associated records.`}
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous={true}
        isLoading={deleteMutation.isPending}
      />
    </div>
  )
}
