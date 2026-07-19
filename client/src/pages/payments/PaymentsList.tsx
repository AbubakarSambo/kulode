import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Download02Icon,
  PencilEdit02Icon,
  Delete02Icon,
  ArrowDown01Icon,
  MoreVerticalIcon,
  Search01Icon,
  CreditCardIcon,
  FilterHorizontalIcon,
  Calendar03Icon,
} from '@hugeicons/core-free-icons'
import { toast } from 'sonner'
import { Header } from '@/components/layout'
import { Button, Input, Card, CardContent, ConfirmDialog, EmptyState, DropdownPanel } from '@/components/ui'
import { BottomSheet } from '@/components/shared'
import { paymentsApi } from '@/api'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { posthog } from '@/lib/posthog'
import { useAuthStore } from '@/stores/auth'
import { PaymentsIcon } from '@/components/ui/CustomIcons'
import type { PaymentMethod } from '@/types'
import { useOverscrollBounce } from '@/hooks'
import { useSubscription } from '@/hooks/useSubscription'

const methodDotColors: Record<string, string> = {
  BANK_TRANSFER: 'bg-blue-500',
  PAYSTACK: 'bg-indigo-500',
  CARD: 'bg-emerald-500',
  CASH: 'bg-slate-400',
  OTHER: 'bg-slate-300',
}

const methodTextColors: Record<string, string> = {
  BANK_TRANSFER: 'text-blue-700',
  PAYSTACK: 'text-indigo-700',
  CARD: 'text-emerald-700',
  CASH: 'text-slate-600',
  OTHER: 'text-slate-500',
}

const formatPaymentMethod = (method: string) => {
  if (!method) return ''
  return method
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
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
  const { isReadOnlyMode: isExpired } = useSubscription()
  const scrollContainerRef = useOverscrollBounce<HTMLDivElement>()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [limitOpen, setLimitOpen] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('')
  const [methodDropdownOpen, setMethodDropdownOpen] = useState(false)
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false)
  const [tempMethod, setTempMethod] = useState<PaymentMethod | ''>('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const openMobileFilters = () => {
    setTempMethod(paymentMethod)
    setIsMobileFiltersOpen(true)
  }

  const closeMobileFilters = () => {
    setIsMobileFiltersOpen(false)
  }
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [paymentToDelete, setPaymentToDelete] = useState<{ id: string; invoiceNumber: string } | null>(null)
  const user = useAuthStore((s) => s.user)
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'
  const queryClient = useQueryClient()

  const handleExportCSV = () => {
    const rows = data?.data ?? []
    if (!rows.length) { toast.error('No payments to export'); return }
    const headers = ['Invoice', 'Client', 'Method', 'Date', 'Reference', 'Amount']
    const lines = rows.map(p => [
      p.invoice?.invoiceNumber ?? '',
      p.invoice?.client?.name ?? '',
      p.paymentMethod,
      p.paymentDate,
      p.reference ?? '',
      p.amount,
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    const csv = [headers.join(','), ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'payments.csv'
    a.click()
    URL.revokeObjectURL(url)
    posthog.capture('payments_exported')
    toast.success('Payments exported')
  }

  const deleteMutation = useMutation({
    mutationFn: (id: string) => paymentsApi.delete(id),
    onSuccess: (_, id) => {
      posthog.capture('payment_deleted', { payment_id: id })
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      toast.success('Payment deleted successfully')
    },
    onError: () => {
      toast.error('Failed to delete payment')
    },
  })

  const handleDeleteTrigger = (paymentId: string, invoiceNumber: string) => {
    setPaymentToDelete({ id: paymentId, invoiceNumber })
    setDeleteConfirmOpen(true)
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
    queryKey: ['payments', { page, limit, paymentMethod, startDate, endDate }],
    queryFn: () => paymentsApi.list({ page, limit, paymentMethod: paymentMethod || undefined, startDate: startDate || undefined, endDate: endDate || undefined }),
  })

  const payments = data?.data ?? []
  const filteredPayments = payments.filter((payment) => {
    const invNum = payment.invoice?.invoiceNumber?.toLowerCase() || ''
    const clientName = payment.invoice?.client?.name?.toLowerCase() || ''
    const ref = payment.reference?.toLowerCase() || ''
    const s = search.toLowerCase()
    return invNum.includes(s) || clientName.includes(s) || ref.includes(s)
  })

  return (
    <div className="flex flex-1 flex-col overflow-hidden relative min-h-0">
      <Header
        title="Payments"
        description="View all received payments"
        icon={PaymentsIcon}
        category="Finance"
        badgeText={data?.meta.total}
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleExportCSV} className="h-10 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors">
              <HugeiconsIcon icon={Download02Icon} className="mr-2 h-4 w-4" strokeWidth={1.5} />
              Export CSV
            </Button>
            {isExpired ? (
              <Button
                disabled
                className="opacity-50 cursor-not-allowed bg-slate-400 text-white rounded-xl h-10 px-4 select-none"
              >
                Record Payment
              </Button>
            ) : (
              <Link to="/invoices">
                <Button className="h-10 px-4 rounded-xl bg-gradient-to-r from-[#0037b0] to-[#1d4ed8] text-white shadow-[0px_4px_12px_rgba(0,55,176,0.15)] hover:opacity-95">
                  Record Payment
                </Button>
              </Link>
            )}
          </div>
        }
      />

      <div ref={scrollContainerRef} className="flex-1 overflow-auto px-4 pb-4 pt-0 sm:px-6 sm:pb-6 sm:pt-0">
        <div className="pt-4 sm:pt-6">
        {/* Filters and Search */}
        <div className="mb-6 flex flex-col gap-4 stagger-in sticky top-0 md:static z-20 bg-background py-3 -mx-4 px-4 md:-mx-0 md:px-0 md:bg-transparent md:py-0 md:mb-6 border-b border-[#eef4ff]/30 md:border-b-0">
          {/* Desktop Filters (hidden on mobile) */}
          <div className="hidden md:flex flex-row items-center gap-4 justify-between w-full">
            <div className="flex items-center gap-3 flex-1">
              <div className="relative flex-1 max-w-[240px]">
                <HugeiconsIcon icon={Search01Icon} className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={1.5} />
                <Input
                  placeholder="Search payments..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                  className="pl-11 rounded-xl h-10 bg-white border border-border"
                />
              </div>

              {/* Date range filter */}
              <div className="flex items-center gap-2">
                <HugeiconsIcon icon={Calendar03Icon} className="h-4 w-4 text-slate-400 shrink-0" strokeWidth={1.5} />
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => { setStartDate(e.target.value); setPage(1) }}
                  className="h-10 rounded-xl text-[16px] sm:text-xs w-36 bg-white border border-border"
                />
                <span className="text-xs text-slate-400">–</span>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => { setEndDate(e.target.value); setPage(1) }}
                  className="h-10 rounded-xl text-[16px] sm:text-xs w-36 bg-white border border-border"
                />
                {(startDate || endDate) && (
                  <button
                    onClick={() => { setStartDate(''); setEndDate(''); setPage(1) }}
                    className="text-xs text-slate-400 hover:text-slate-650 px-2 cursor-pointer font-bold border-0 bg-transparent"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Method Dropdown */}
              <div className="relative inline-block text-left">
                <button
                  type="button"
                  onClick={() => setMethodDropdownOpen(!methodDropdownOpen)}
                  className={cn(
                    "h-10 px-4 rounded-xl border bg-white text-xs font-semibold hover:bg-slate-50 transition-all flex items-center justify-between gap-2 min-w-[150px] cursor-pointer",
                    paymentMethod ? "border-[#0037b0]/35 text-[#0037b0] bg-[#0037b0]/04" : "border-border text-slate-700"
                  )}
                >
                  <span className="truncate">
                    {paymentMethod ? formatPaymentMethod(paymentMethod) : 'All Methods'}
                  </span>
                  <HugeiconsIcon icon={ArrowDown01Icon} className={cn("h-4 w-4 text-slate-400 transition-transform duration-200 shrink-0", methodDropdownOpen && "rotate-180")} strokeWidth={1.5} />
                </button>

                <DropdownPanel
                  isOpen={methodDropdownOpen}
                  onClose={() => setMethodDropdownOpen(false)}
                  align="left"
                  widthClass="w-52"
                >
                  {([
                    { label: 'All Methods', value: '' },
                    { label: 'Bank Transfer', value: 'BANK_TRANSFER' },
                    { label: 'Paystack', value: 'PAYSTACK' },
                    { label: 'Card', value: 'CARD' },
                    { label: 'Cash', value: 'CASH' },
                  ] as const).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setPaymentMethod(opt.value)
                        setPage(1)
                        setMethodDropdownOpen(false)
                      }}
                      className={cn(
                        "w-full text-left px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors block cursor-pointer",
                        paymentMethod === opt.value 
                          ? "bg-[#0037b0]/5 text-[#0037b0]" 
                          : "text-slate-700 hover:bg-slate-50"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </DropdownPanel>
              </div>
            </div>
          </div>

          {/* Mobile Search and Filter trigger row (hidden on desktop) */}
          <div className="flex md:hidden flex-row items-center gap-2 w-full">
            <div className="relative flex-1">
              <HugeiconsIcon icon={Search01Icon} className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={1.5} />
              <Input
                placeholder="Search payments..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                className="pl-11 rounded-xl h-11 bg-white w-full border-border focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
              />
            </div>

            <button
              type="button"
              onClick={openMobileFilters}
              className={cn(
                "h-11 w-11 rounded-xl border flex items-center justify-center relative hover:bg-slate-50 transition-all shrink-0 cursor-pointer",
                paymentMethod !== '' 
                  ? "border-[#0037b0] text-[#0037b0] bg-[#0037b0]/04" 
                  : "border-border bg-white text-slate-750"
              )}
              aria-label="Filters"
            >
              <HugeiconsIcon icon={FilterHorizontalIcon} className="h-5 w-5" strokeWidth={1.5} />
              {paymentMethod !== '' && (
                <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-[20px] px-1.5 items-center justify-center rounded-full bg-[#0037b0] text-[10px] font-black text-white leading-none border border-white">
                  1
                </span>
              )}
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : payments.length === 0 ? (
          <EmptyState
            icon={CreditCardIcon}
            title="No payments recorded yet"
            description="All client invoice payments (Paystack, bank transfers, cash) will appear here. Open an invoice to record a payment against it."
            actionLabel={isExpired ? undefined : "Record a payment"}
            actionHref={isExpired ? undefined : "/invoices"}
          />
        ) : filteredPayments.length === 0 ? (
          <EmptyState
            icon={CreditCardIcon}
            title="No payments found matching search"
            description="Try adjusting your search terms or status filters."
          />
        ) : (
          <>
            {/* Desktop Table View */}
            <Card className="hidden md:block border-0 bg-white shadow-[0px_12px_32px_rgba(0,55,176,0.08)] rounded-[24px] overflow-visible">
              <CardContent className="p-0">
                <div className="overflow-visible">
                  <table className="w-full min-w-[700px] border-collapse">
                    <thead>
                      <tr className="bg-white text-slate-600">
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-left text-[10px] font-extrabold uppercase tracking-widest text-slate-400 select-none">Invoice</th>
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-left text-[10px] font-extrabold uppercase tracking-widest text-slate-400 select-none">Method</th>
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-left text-[10px] font-extrabold uppercase tracking-widest text-slate-400 select-none">Date</th>
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-left text-[10px] font-extrabold uppercase tracking-widest text-slate-400 select-none">Reference</th>
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-right text-[10px] font-extrabold uppercase tracking-widest text-slate-400 select-none">Amount</th>
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-right text-[10px] font-extrabold uppercase tracking-widest text-slate-400 select-none">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y-0">
                      {filteredPayments.map((payment, index) => (
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
                          <td className="px-6 py-4 text-left">
                            <div className="flex items-center gap-2 select-none justify-start">
                              <span className={cn(
                                "h-1.5 w-1.5 rounded-full shrink-0",
                                methodDotColors[payment.paymentMethod] || methodDotColors.OTHER
                              )} />
                              <span className={cn(
                                "text-xs font-semibold tracking-wide",
                                methodTextColors[payment.paymentMethod] || methodTextColors.OTHER
                              )}>
                                {formatPaymentMethod(payment.paymentMethod)}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-xs font-semibold text-slate-500">
                            {formatDate(payment.paymentDate)}
                          </td>
                          <td className="px-6 py-4 text-xs font-semibold text-slate-400">
                            {payment.reference ?? '-'}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span className="font-semibold text-slate-800 tabular-nums text-sm">
                              {formatCurrency(payment.amount)}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right relative">
                            <div className="inline-block text-left relative">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveDropdown(activeDropdown === payment.id ? null : payment.id);
                                }}
                                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors cursor-pointer"
                              >
                                <HugeiconsIcon icon={MoreVerticalIcon} size={16} strokeWidth={1.5} />
                              </button>

                              <DropdownPanel
                                isOpen={activeDropdown === payment.id}
                                onClose={() => setActiveDropdown(null)}
                                align="right"
                                widthClass="w-44"
                                zIndexClass="z-20"
                              >
                                <button
                                  onClick={() => {
                                    setActiveDropdown(null);
                                    handleDownloadReceipt(payment.id, payment.invoice?.invoiceNumber || 'unknown');
                                  }}
                                  disabled={downloadingId === payment.id}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer rounded-lg"
                                >
                                  <HugeiconsIcon icon={Download02Icon} size={14} className="text-slate-400" strokeWidth={1.5} />
                                  Download Receipt
                                </button>
                                {isSuperAdmin && !isExpired && (
                                  <>
                                    <Link
                                      to={`/payments/${payment.id}/edit`}
                                      onClick={() => setActiveDropdown(null)}
                                      className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors rounded-lg"
                                    >
                                      <HugeiconsIcon icon={PencilEdit02Icon} size={14} className="text-slate-400" strokeWidth={1.5} />
                                      Edit Payment
                                    </Link>
                                    <button
                                      onClick={() => {
                                        setActiveDropdown(null);
                                        handleDeleteTrigger(payment.id, payment.invoice?.invoiceNumber || 'unknown');
                                      }}
                                      disabled={deleteMutation.isPending}
                                      className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer rounded-lg"
                                    >
                                      <HugeiconsIcon icon={Delete02Icon} size={14} className="text-rose-500" strokeWidth={1.5} />
                                      Delete Payment
                                    </button>
                                  </>
                                )}
                              </DropdownPanel>
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
              {filteredPayments.map((payment) => (
                <div 
                  key={payment.id}
                  className="bg-white rounded-[24px] p-5 shadow-[0px_8px_24px_rgba(0,55,176,0.08)] border-0 transition-all duration-300 hover:shadow-[0px_12px_32px_rgba(0,55,176,0.12)] relative"
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
                    <span className="text-sm font-semibold text-slate-800 shrink-0 tabular-nums">
                      {formatCurrency(payment.amount)}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex items-center gap-1.5 select-none">
                      <span className={cn(
                        "h-1.5 w-1.5 rounded-full shrink-0",
                        methodDotColors[payment.paymentMethod] || methodDotColors.OTHER
                      )} />
                      <span className={cn(
                        "text-[10px] font-bold uppercase tracking-wider",
                        methodTextColors[payment.paymentMethod] || methodTextColors.OTHER
                      )}>
                        {formatPaymentMethod(payment.paymentMethod)}
                      </span>
                    </div>
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
                    <div className="flex items-center gap-2 -my-2.5">
                      {isSuperAdmin && !isExpired && (
                        <>
                          <Link 
                            to={`/payments/${payment.id}/edit`}
                            className="w-11 h-11 rounded-full flex items-center justify-center bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer border border-[#eef4ff]/60 shrink-0"
                            aria-label="Edit"
                          >
                            <HugeiconsIcon icon={PencilEdit02Icon} size={16} strokeWidth={1.5} />
                          </Link>
                          <button
                            onClick={() => handleDeleteTrigger(payment.id, payment.invoice?.invoiceNumber || 'unknown')}
                            disabled={deleteMutation.isPending}
                            className="w-11 h-11 rounded-full flex items-center justify-center bg-rose-50/50 text-rose-600 hover:bg-rose-100/50 hover:text-rose-700 transition-colors cursor-pointer border border-rose-500/10 shrink-0"
                            aria-label="Delete"
                          >
                            <HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={1.5} />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleDownloadReceipt(payment.id, payment.invoice?.invoiceNumber || 'unknown')}
                        disabled={downloadingId === payment.id}
                        className="w-11 h-11 rounded-full flex items-center justify-center bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer border border-[#eef4ff]/60 shrink-0"
                        aria-label="Download Receipt"
                      >
                        <HugeiconsIcon icon={Download02Icon} size={16} strokeWidth={1.5} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Pagination & Limit Selector (Desktop only) */}
        {data && data.meta.total > 0 && (
          <div className="hidden md:flex mt-6 flex-row items-center justify-between gap-4 border-t border-[#eef4ff]/50 pt-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-semibold">Show:</span>
              <div className="relative inline-block text-left">
                <button
                  onClick={() => setLimitOpen(!limitOpen)}
                  className="h-9 px-3.5 rounded-xl border border-border bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all flex items-center justify-between gap-2 shadow-[0px_4px_12px_rgba(0,55,176,0.01)] cursor-pointer min-w-[120px]"
                >
                  <span>{limit} per page</span>
                  <HugeiconsIcon icon={ArrowDown01Icon} className={cn("h-3.5 w-3.5 text-slate-400 transition-transform duration-200", limitOpen && "rotate-180")} strokeWidth={1.5} />
                </button>

                <DropdownPanel
                  isOpen={limitOpen}
                  onClose={() => setLimitOpen(false)}
                  align="left"
                  widthClass="w-full min-w-[120px]"
                  zIndexClass="z-20"
                  animateDirection="bottom"
                  className="bottom-11"
                >
                  {([10, 25, 50, 100] as const).map((val) => (
                    <button
                      key={val}
                      onClick={() => {
                        setLimit(val);
                        setPage(1);
                        setLimitOpen(false);
                      }}
                      className={cn(
                        "w-full text-left px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors block cursor-pointer",
                        limit === val 
                          ? "bg-[#0037b0]/5 text-[#0037b0]" 
                          : "text-slate-700 hover:bg-slate-50"
                      )}
                    >
                      {val} per page
                    </button>
                  ))}
                </DropdownPanel>
              </div>
            </div>
            
            {data.meta.totalPages >= 1 && (
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

        {/* Mobile Load More Button */}
        {data && data.meta.total > limit && (
          <div className="mt-6 md:hidden flex justify-center">
            <Button
              onClick={() => setLimit((prev) => prev + 10)}
              variant="outline"
              className="w-full py-4 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-all min-h-[44px]"
            >
              Load More Payments ({data.meta.total - limit} remaining)
            </Button>
          </div>
        )}
      </div>

      {/* Mobile slide-up bottom sheet for filters */}
      <BottomSheet
        isOpen={isMobileFiltersOpen}
        onClose={closeMobileFilters}
        title="Filter Payments"
        onClearAll={() => setTempMethod('')}
      >
        {/* Scrollable Filters list */}
        <div className="flex-1 overflow-y-auto space-y-4 pb-6 select-none text-left">
          {/* Method Section */}
          <div className="bg-[#eef4ff]/35 rounded-2xl p-4">
            <h4 className="text-[10px] font-extrabold uppercase tracking-widest text-[#0037b0]/60 mb-3">Method</h4>
            <div className="flex flex-wrap gap-2">
              {([
                { label: 'All Methods', value: '' },
                { label: 'Bank Transfer', value: 'BANK_TRANSFER' },
                { label: 'Paystack', value: 'PAYSTACK' },
                { label: 'Card', value: 'CARD' },
                { label: 'Cash', value: 'CASH' },
              ] as const).map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setTempMethod(opt.value)}
                  className={cn(
                    "py-2 px-3.5 rounded-full text-xs font-semibold transition-all text-center cursor-pointer border-0",
                    tempMethod === opt.value
                      ? "bg-[#0037b0] text-white shadow-sm font-bold"
                      : "bg-slate-100 text-slate-655 hover:bg-slate-200"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="grid grid-cols-2 gap-3 pt-4 border-t border-[#eef4ff]/50 shrink-0">
          <Button
            variant="outline"
            type="button"
            onClick={closeMobileFilters}
            className="py-3 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all min-h-[44px] border-0 shadow-none"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              setPaymentMethod(tempMethod)
              setPage(1)
              closeMobileFilters()
            }}
            className="py-3 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-[#0037b0] to-[#1d4ed8] hover:opacity-95 transition-all min-h-[44px] border-0"
          >
            Apply Filters
          </Button>
        </div>
      </BottomSheet>

      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        onClose={() => {
          setDeleteConfirmOpen(false)
          setPaymentToDelete(null)
        }}
        onConfirm={() => {
          if (paymentToDelete) {
            deleteMutation.mutate(paymentToDelete.id, {
              onSuccess: () => {
                setDeleteConfirmOpen(false)
                setPaymentToDelete(null)
              }
            })
          }
        }}
        title="Delete Payment"
        description={`Are you sure you want to delete the payment for invoice ${paymentToDelete?.invoiceNumber}? This action cannot be undone and will update the associated invoice balance.`}
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous={true}
        isLoading={deleteMutation.isPending}
      />
        </div>
      </div>
    )
  }
