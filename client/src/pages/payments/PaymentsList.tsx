import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Download, Pencil, Trash2, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { Header } from '@/components/layout'
import { Button, Card, CardContent } from '@/components/ui'
import { paymentsApi } from '@/api'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { posthog } from '@/lib/posthog'
import { useAuthStore } from '@/stores/auth'
import { PaymentsIcon } from '@/components/ui/CustomIcons'
import type { PaymentMethod } from '@/types'

const methodStyles: Record<string, string> = {
  BANK_TRANSFER: 'text-blue-700 bg-blue-50/50 border border-blue-100/30',
  PAYSTACK: 'text-indigo-700 bg-indigo-50/50 border border-indigo-100/30',
  CARD: 'text-emerald-700 bg-emerald-50/50 border border-emerald-100/30',
  CASH: 'text-slate-600 bg-slate-100/80 border border-slate-200/25',
  OTHER: 'text-slate-500 bg-slate-100/50 border border-slate-200/10',
}

const getInitials = (name: string) => {
  if (!name) return '??'
  const cleanName = name.replace(/^(Mrs\.|Mr\.|Dr\.|Prof\.)\s+/i, '').trim();
  const parts = cleanName.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function PaymentsListPage() {
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [limitOpen, setLimitOpen] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('')
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const user = useAuthStore((s) => s.user)
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'
  const queryClient = useQueryClient()

  const deleteMutation = useMutation({
    mutationFn: (id: string) => paymentsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      toast.success('Payment deleted successfully')
    },
    onError: () => {
      toast.error('Failed to delete payment')
    },
  })

  const handleDelete = (paymentId: string) => {
    if (window.confirm('Are you sure you want to delete this payment? This will update the invoice balance.')) {
      deleteMutation.mutate(paymentId)
    }
  }

  const handleDownloadReceipt = async (paymentId: string, invoiceNumber: string) => {
    setDownloadingId(paymentId)
    try {
      const blob = await paymentsApi.downloadReceipt(paymentId)
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `receipt-${invoiceNumber}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      posthog.capture('payment_receipt_downloaded', { payment_id: paymentId })
    } catch {
      toast.error('Failed to download receipt')
    } finally {
      setDownloadingId(null)
    }
  }

  const { data, isLoading } = useQuery({
    queryKey: ['payments', { page, limit, paymentMethod }],
    queryFn: () => paymentsApi.list({ page, limit, paymentMethod: paymentMethod || undefined }),
  })

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="Payments"
        description="View all received payments"
        icon={PaymentsIcon}
        category="Finance"
        badgeText={data?.meta.total}
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {/* Filters */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between stagger-in sticky top-0 md:static z-20 bg-[#f8f9ff]/95 backdrop-blur-sm py-3 -mx-4 px-4 md:-mx-0 md:px-0 md:bg-transparent md:py-0 md:mb-6 border-b border-[#eef4ff]/30 md:border-b-0">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-2 whitespace-nowrap">Method:</span>
            {([
              { label: 'All Methods', value: '' },
              { label: 'Bank Transfer', value: 'BANK_TRANSFER' },
              { label: 'Paystack', value: 'PAYSTACK' },
              { label: 'Card', value: 'CARD' },
              { label: 'Cash', value: 'CASH' },
            ] as const).map((opt) => {
              const isActive = paymentMethod === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => { setPaymentMethod(opt.value); setPage(1); }}
                  className={cn(
                    "rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-all duration-200 cursor-pointer border border-transparent whitespace-nowrap",
                    isActive
                      ? "bg-[#0037b0] text-white shadow-[0px_4px_12px_rgba(0,55,176,0.2)] font-bold"
                      : "bg-[#eef4ff] text-[#434655] hover:bg-[#e5eeff]"
                  )}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : data?.data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground">No payments recorded yet</p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <Card className="hidden md:block border-0 bg-white shadow-[0px_12px_32px_rgba(0,55,176,0.03)] rounded-[24px] overflow-hidden">
              <CardContent className="p-0">
                <div className="overflow-auto max-h-[60vh]">
                  <table className="w-full min-w-[700px] border-collapse">
                    <thead>
                      <tr className="bg-white text-slate-600">
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 select-none">Invoice</th>
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400 select-none">Method</th>
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 select-none">Date</th>
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 select-none">Reference</th>
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400 select-none">Amount</th>
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400 select-none">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y-0">
                      {data?.data.map((payment, index) => (
                        <tr 
                          key={payment.id} 
                          className={cn(
                            "transition-all duration-150 hover:bg-[#eef4ff]/20",
                            index % 2 === 0 ? "bg-transparent" : "bg-[#eef4ff]/08"
                          )}
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-[#0037b0]/5 text-[#0037b0] border border-[#0037b0]/8 flex items-center justify-center text-[11px] font-bold shrink-0 select-none">
                                {getInitials(payment.invoice?.client?.name || '')}
                              </div>
                              <div>
                                <Link to={`/invoices/${payment.invoice?.id}`} className="font-bold text-[#0037b0] hover:text-[#002e90] transition-colors block text-sm">
                                  {payment.invoice?.invoiceNumber}
                                </Link>
                                <span className="text-xs font-semibold text-slate-500 block mt-0.5">
                                  {payment.invoice?.client?.name}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={cn(
                              "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider",
                              methodStyles[payment.paymentMethod] || methodStyles.OTHER
                            )}>
                              {payment.paymentMethod.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-xs font-semibold text-slate-500">
                            {formatDate(payment.paymentDate)}
                          </td>
                          <td className="px-6 py-4 text-xs font-semibold text-slate-400">
                            {payment.reference ?? '-'}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span className="font-extrabold text-emerald-700 bg-emerald-50/50 px-2.5 py-1 rounded-lg inline-block tabular-nums text-xs">
                              +{formatCurrency(payment.amount)}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {isSuperAdmin && (
                                <>
                                  <Link to={`/payments/${payment.id}/edit`}>
                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg">
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                  </Link>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                                    onClick={() => handleDelete(payment.id)}
                                    disabled={deleteMutation.isPending}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 rounded-lg"
                                onClick={() => handleDownloadReceipt(payment.id, payment.invoice?.invoiceNumber || 'unknown')}
                                disabled={downloadingId === payment.id}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Mobile Card-Based List View */}
            <div className="flex flex-col gap-4 md:hidden">
              {data?.data.map((payment) => (
                <div 
                  key={payment.id}
                  className="bg-white rounded-[24px] p-5 shadow-[0px_8px_24px_rgba(0,55,176,0.03)] border-0 transition-all duration-300 hover:shadow-[0px_12px_32px_rgba(0,55,176,0.06)] relative"
                >
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#0037b0]/5 text-[#0037b0] border border-[#0037b0]/8 flex items-center justify-center text-xs font-bold shrink-0 select-none">
                        {getInitials(payment.invoice?.client?.name || '')}
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-slate-500 block">{payment.invoice?.client?.name}</span>
                        <Link to={`/invoices/${payment.invoice?.id}`} className="font-bold text-[#0037b0] hover:underline text-sm block mt-0.5">
                          {payment.invoice?.invoiceNumber}
                        </Link>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-emerald-700 bg-emerald-50/50 px-2.5 py-0.5 rounded-full shrink-0 tabular-nums">
                      +{formatCurrency(payment.amount)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mb-3">
                    <span className={cn(
                      "px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider",
                      methodStyles[payment.paymentMethod] || methodStyles.OTHER
                    )}>
                      {payment.paymentMethod.replace('_', ' ')}
                    </span>
                    {payment.reference && (
                      <span className="text-[10px] text-slate-400 font-semibold truncate max-w-[180px]">
                        Ref: {payment.reference}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#eef4ff]/50">
                    <span className="text-xs text-slate-400 font-medium">
                      {formatDate(payment.paymentDate)}
                    </span>
                    <div className="flex items-center gap-1.5 -my-2.5">
                      {isSuperAdmin && (
                        <>
                          <Link 
                            to={`/payments/${payment.id}/edit`}
                            className="p-2 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors min-h-[44px]"
                            aria-label="Edit"
                          >
                            <Pencil className="h-4 w-4" strokeWidth={1.5} />
                          </Link>
                          <button
                            onClick={() => handleDelete(payment.id)}
                            disabled={deleteMutation.isPending}
                            className="p-2 rounded-full hover:bg-rose-50 text-rose-500 hover:text-rose-700 transition-colors cursor-pointer min-h-[44px]"
                            aria-label="Delete"
                          >
                            <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleDownloadReceipt(payment.id, payment.invoice?.invoiceNumber || 'unknown')}
                        disabled={downloadingId === payment.id}
                        className="p-2 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors cursor-pointer min-h-[44px]"
                        aria-label="Download Receipt"
                      >
                        <Download className="h-4 w-4" strokeWidth={1.5} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Pagination & Limit Selector */}
        {data && data.meta.total > 10 && (
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-[#eef4ff]/50 pt-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-semibold">Show:</span>
              <div className="relative inline-block text-left">
                <button
                  onClick={() => setLimitOpen(!limitOpen)}
                  className="h-9 px-3.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all flex items-center justify-between gap-2 shadow-[0px_4px_12px_rgba(0,55,176,0.01)] cursor-pointer min-w-[120px]"
                >
                  <span>{limit} per page</span>
                  <ChevronDown className={cn("h-3.5 w-3.5 text-slate-400 transition-transform duration-200", limitOpen && "rotate-180")} strokeWidth={1.5} />
                </button>

                {limitOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-10" 
                      onClick={() => setLimitOpen(false)}
                    />
                    <div className="absolute bottom-11 left-0 w-full min-w-[120px] rounded-xl bg-white py-1 shadow-[0px_12px_32px_rgba(0,55,176,0.08)] ring-1 ring-black/5 z-20 animate-in fade-in slide-in-from-bottom-1 duration-150 text-left">
                      {([10, 25, 50, 100] as const).map((val) => (
                        <button
                          key={val}
                          onClick={() => {
                            setLimit(val);
                            setPage(1);
                            setLimitOpen(false);
                          }}
                          className={cn(
                            "w-full text-left px-3.5 py-2.5 text-xs font-semibold transition-colors block cursor-pointer",
                            limit === val 
                              ? "bg-[#0037b0]/5 text-[#0037b0]" 
                              : "text-slate-700 hover:bg-slate-50"
                          )}
                        >
                          {val} per page
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
            
            {data.meta.totalPages > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                  className="h-8 rounded-lg text-xs"
                >
                  Previous
                </Button>
                <span className="text-xs text-slate-500 font-medium">
                  Page {page} of {data.meta.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === data.meta.totalPages}
                  onClick={() => setPage(page + 1)}
                  className="h-8 rounded-lg text-xs"
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
