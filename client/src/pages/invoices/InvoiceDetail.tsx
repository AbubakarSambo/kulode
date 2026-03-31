import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Send,
  Ban,
  Trash2,
  Plus,
  CreditCard,
  FileText,
  CheckCircle,
  Link2,
  Copy,
  ExternalLink,
  Download,
  AlertTriangle,
} from 'lucide-react'

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}
import { Header } from '@/components/layout'
import { Button, Input, Label, Select, Textarea, Card, CardContent, CardHeader, CardTitle, Badge } from '@/components/ui'
import { Modal } from '@/components/shared/Modal'
import { invoicesApi, paymentsApi, organizationsApi } from '@/api'
import apiClient from '@/api/client'
import type { ApiResponse } from '@/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import { posthog } from '@/lib/posthog'
import type { InvoiceStatus, PaymentMethod } from '@/types'
import { useAuthStore } from '@/stores/auth'

const statusColors: Record<InvoiceStatus, 'default' | 'secondary' | 'success' | 'warning' | 'destructive'> = {
  DRAFT: 'secondary',
  SENT: 'default',
  PAID: 'success',
  PARTIALLY_PAID: 'warning',
  OVERDUE: 'destructive',
  CANCELLED: 'secondary',
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
      // Open in new tab
      window.open(data.paymentUrl, '_blank')
    },
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
  const hasPaymentLink = !!(invoice as any).paymentUrl

  const copyPaymentLink = () => {
    const url = (invoice as any).paymentUrl
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

      // Create blob URL and trigger download
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
    } catch (error) {
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
        // Fallback: download the PDF on desktop
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
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title={invoice.invoiceNumber}
        description={`Invoice for ${invoice.client.name}`}
        action={
          <div className="flex flex-wrap gap-2">
            {invoice.status !== 'DRAFT' && (
              <Button variant="outline" onClick={shareInvoice} isLoading={isSharing}>
                {!isSharing && <WhatsAppIcon className="mr-2 h-4 w-4" />}
                Share
              </Button>
            )}
            <Button variant="outline" onClick={downloadPdf}>
              <Download className="mr-2 h-4 w-4" />
              PDF
            </Button>
            {canGenerateLink && !hasPaymentLink && (
              <Button onClick={() => setIsPaymentLinkModalOpen(true)}>
                <Link2 className="mr-2 h-4 w-4" />
                Generate Payment Link
              </Button>
            )}
            {hasPaymentLink && (
              <>
                <Button variant="outline" onClick={copyPaymentLink}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Link
                </Button>
                <a href={(invoice as any).paymentUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Open Link
                  </Button>
                </a>
              </>
            )}
            {canRecordPayment && (
              <Button onClick={openPaymentModal}>
                <Plus className="mr-2 h-4 w-4" />
                Record Payment
              </Button>
            )}
            {canSend && (
              <Button variant="outline" onClick={() => sendMutation.mutate()}>
                <Send className="mr-2 h-4 w-4" />
                Mark as Sent
              </Button>
            )}
            {canCancel && (
              <Button variant="outline" onClick={() => cancelMutation.mutate()}>
                <Ban className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            )}
            {canDelete && (
              <Button variant="outline" onClick={handleDelete}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            )}
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          {/* Status Bar */}
          <Card>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <Badge variant={statusColors[invoice.status]} className="text-sm">
                  {invoice.status.replace('_', ' ')}
                </Badge>
                {invoice.status === 'PAID' && (
                  <span className="flex items-center gap-1 text-sm text-success">
                    <CheckCircle className="h-4 w-4" />
                    Fully paid
                  </span>
                )}
              </div>
              <div className="sm:text-right">
                <p className="text-sm text-muted-foreground">Outstanding</p>
                <p className="text-xl font-bold">{formatCurrency(outstanding)}</p>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Invoice Info */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Invoice Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Client & Dates */}
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <p className="text-sm text-muted-foreground">Client</p>
                    <Link to={`/clients/${invoice.client.id}`} className="font-medium text-primary hover:underline">
                      {invoice.client.name}
                    </Link>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Issue Date</p>
                    <p className="font-medium">{formatDate(invoice.issueDate)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Due Date</p>
                    <p className="font-medium">{formatDate(invoice.dueDate)}</p>
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
                      {Number((invoice as any).discountAmount) > 0 && (
                        <tr className="text-success">
                          <td colSpan={3} className="py-1 text-right">Discount ({(invoice as any).discountPercent}%)</td>
                          <td className="py-1 text-right">-{formatCurrency((invoice as any).discountAmount)}</td>
                        </tr>
                      )}
                      {Number(invoice.taxAmount) > 0 && (
                        <tr>
                          <td colSpan={3} className="py-1 text-right text-muted-foreground">VAT ({(invoice as any).taxRate ?? 7.5}%)</td>
                          <td className="py-1 text-right">{formatCurrency(invoice.taxAmount)}</td>
                        </tr>
                      )}
                      <tr className="text-lg">
                        <td colSpan={3} className="py-3 text-right font-semibold">Total</td>
                        <td className="py-3 text-right font-semibold">{formatCurrency(invoice.total)}</td>
                      </tr>
                      {Number(invoice.amountPaid) > 0 && (
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
                    <p className="text-sm text-muted-foreground">Notes</p>
                    <p className="mt-1">{invoice.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Payments */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Payments
                </CardTitle>
              </CardHeader>
              <CardContent>
                {invoice.payments && invoice.payments.length > 0 ? (
                  <div className="space-y-3">
                    {invoice.payments.map((payment) => (
                      <div key={payment.id} className="rounded-lg border p-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium text-success">
                              +{formatCurrency(payment.amount)}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {payment.paymentMethod.replace('_', ' ')}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm text-muted-foreground">
                              {formatDate(payment.paymentDate)}
                            </p>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => downloadReceipt(payment.id)}
                              disabled={downloadingReceiptId === payment.id}
                            >
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        {payment.reference && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Ref: {payment.reference}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground">No payments yet</p>
                )}
              </CardContent>
            </Card>
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
            <div className="flex gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4">
              <AlertTriangle className="h-5 w-5 shrink-0 text-warning mt-0.5" />
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

      {/* Payment Modal */}
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
