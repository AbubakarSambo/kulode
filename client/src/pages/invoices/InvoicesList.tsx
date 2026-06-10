import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  PlusSignIcon,
  Search01Icon,
  ArrowDown01Icon,
  Invoice03Icon,
  FilterHorizontalIcon,
  Calendar03Icon,
} from '@hugeicons/core-free-icons'
import { toast } from 'sonner'
import { Header } from '@/components/layout'
import { Button, Input, Card, CardContent, EmptyState, DropdownPanel } from '@/components/ui'
import { BottomSheet } from '@/components/shared'
import { invoicesApi } from '@/api'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import type { InvoiceStatus } from '@/types'
import { InvoicesIcon } from '@/components/ui/CustomIcons'
import { useOverscrollBounce } from '@/hooks'


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
      text: 'text-slate-500',
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
    <div className="flex items-center gap-2 select-none justify-start">
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", config.dot)} />
      <span className={cn("text-xs font-semibold tracking-wide", config.text)}>
        {config.label}
      </span>
    </div>
  )
}

const getInitials = (name: string) => {
  if (!name) return '??'
  const cleanName = name.replace(/^(Mrs\.|Mr\.|Dr\.|Prof\.)\s+/i, '').trim();
  const parts = cleanName.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function InvoicesListPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<InvoiceStatus | ''>('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [limitOpen, setLimitOpen] = useState(false)
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false)
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false)
  const [tempStatus, setTempStatus] = useState<InvoiceStatus | ''>('')
  const scrollContainerRef = useOverscrollBounce<HTMLDivElement>()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const queryClient = useQueryClient()

  const openMobileFilters = () => {
    setTempStatus(status)
    setIsMobileFiltersOpen(true)
  }

  const closeMobileFilters = () => {
    setIsMobileFiltersOpen(false)
  }

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', { status, page, limit, startDate, endDate }],
    queryFn: () => invoicesApi.list({ status: status || undefined, page, limit, startDate: startDate || undefined, endDate: endDate || undefined }),
  })

  const sendMutation = useMutation({
    mutationFn: (id: string) => invoicesApi.send(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invoices'] }),
  })

  const handleBulkSend = async () => {
    const ids = Array.from(selectedIds)
    await Promise.all(ids.map(id => sendMutation.mutateAsync(id).catch(() => null)))
    toast.success(`Marked ${ids.length} invoice${ids.length !== 1 ? 's' : ''} as sent`)
    setSelectedIds(new Set())
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    const allIds = filteredInvoices.map(i => i.id)
    if (selectedIds.size === allIds.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(allIds))
    }
  }

  // Local filter for search
  const invoices = data?.data ?? []
  const filteredInvoices = invoices.filter(invoice =>
    invoice.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
    invoice.client.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background relative min-h-0">
      <Header
        title="Invoices"
        description="Create and manage invoices"
        icon={InvoicesIcon}
        category="Sales & Billing"
        badgeText={data?.meta.total}
        action={
          <Link to="/invoices/new">
            <Button className="bg-gradient-to-r from-[#0037b0] to-[#1d4ed8] text-white shadow-[0px_4px_12px_rgba(0,55,176,0.15)] hover:opacity-95 rounded-xl h-10 px-4">
              <HugeiconsIcon icon={PlusSignIcon} className="mr-2 h-4 w-4" strokeWidth={1.5} />
              New Invoice
            </Button>
          </Link>
        }
      />

      <div ref={scrollContainerRef} className="flex-1 overflow-auto bg-background px-4 pb-4 pt-0 sm:px-8 sm:pb-8 sm:pt-0">
        <div className="pt-4 sm:pt-8">
        {/* Search & Filters */}
        <div className="mb-6 flex flex-col gap-4 stagger-in sticky top-0 md:static z-20 bg-background py-3 -mx-4 px-4 md:-mx-0 md:px-0 md:bg-transparent md:py-0 md:mb-6 border-b border-[#eef4ff]/30 md:border-b-0">
          {/* Desktop Filters (hidden on mobile) */}
          <div className="hidden md:flex flex-row items-center gap-4 justify-between w-full">
            <div className="flex items-center gap-3 flex-1">
              <div className="relative flex-1 max-w-[240px]">
                <HugeiconsIcon icon={Search01Icon} className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={1.5} />
                <Input
                  placeholder="Search invoices..."
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
                  className="h-10 rounded-xl text-xs w-36 bg-white border border-border"
                />
                <span className="text-xs text-slate-400">–</span>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => { setEndDate(e.target.value); setPage(1) }}
                  className="h-10 rounded-xl text-xs w-36 bg-white border border-border"
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

              {/* Status Dropdown */}
              <div className="relative inline-block text-left">
                <button
                  type="button"
                  onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
                  className={cn(
                    "h-10 px-4 rounded-xl border bg-white text-xs font-semibold hover:bg-slate-50 transition-all flex items-center justify-between gap-2 min-w-[140px] cursor-pointer",
                    status ? "border-[#0037b0]/35 text-[#0037b0] bg-[#0037b0]/04" : "border-border text-slate-700"
                  )}
                >
                  <span className="truncate">
                    {status ? status.replace('_', ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) + ' Invoices' : 'All Invoices'}
                  </span>
                  <HugeiconsIcon icon={ArrowDown01Icon} className={cn("h-4 w-4 text-slate-400 transition-transform duration-200 shrink-0", statusDropdownOpen && "rotate-180")} strokeWidth={1.5} />
                </button>

                <DropdownPanel
                  isOpen={statusDropdownOpen}
                  onClose={() => setStatusDropdownOpen(false)}
                  align="left"
                  widthClass="w-52"
                >
                  {([
                    { label: 'All Invoices', value: '' },
                    { label: 'Draft', value: 'DRAFT' },
                    { label: 'Sent', value: 'SENT' },
                    { label: 'Paid', value: 'PAID' },
                    { label: 'Partially Paid', value: 'PARTIALLY_PAID' },
                    { label: 'Overdue', value: 'OVERDUE' },
                  ] as const).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setStatus(opt.value)
                        setPage(1)
                        setStatusDropdownOpen(false)
                      }}
                      className={cn(
                        "w-full text-left px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors block cursor-pointer",
                        status === opt.value 
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
                placeholder="Search invoices..."
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
                status !== '' 
                  ? "border-[#0037b0] text-[#0037b0] bg-[#0037b0]/04" 
                  : "border-border bg-white text-slate-750"
              )}
              aria-label="Filters"
            >
              <HugeiconsIcon icon={FilterHorizontalIcon} className="h-5 w-5" strokeWidth={1.5} />
              {status !== '' && (
                <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-[20px] px-1.5 items-center justify-center rounded-full bg-[#0037b0] text-[10px] font-black text-white leading-none border border-white">
                  1
                </span>
              )}
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#0037b0] border-t-transparent" />
          </div>
        ) : filteredInvoices.length === 0 ? (
          <EmptyState
            icon={Invoice03Icon}
            title={search ? "No invoices found" : "No invoices recorded"}
            description={search ? "Try adjusting your search terms or status filters." : "Create and send professional invoices, track payments, and get paid faster."}
            actionLabel="Create your first invoice"
            actionHref="/invoices/new"
          />
        ) : (
          <>
            {/* Bulk actions bar */}
            {selectedIds.size > 0 && (
              <div className="mb-4 flex items-center gap-3 bg-[#0037b0]/5 border border-[#0037b0]/15 rounded-xl px-4 py-2.5">
                <span className="text-xs font-bold text-[#0037b0]">{selectedIds.size} selected</span>
                <div className="flex-1" />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs rounded-lg border-[#0037b0]/30 text-[#0037b0]"
                  onClick={handleBulkSend}
                  disabled={sendMutation.isPending}
                >
                  Mark as Sent
                </Button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  Clear
                </button>
              </div>
            )}

            {/* Desktop Table */}
            <Card className="hidden md:block border-0 bg-white shadow-[0px_12px_32px_rgba(0,55,176,0.08)] rounded-[24px] overflow-visible">
              <CardContent className="p-0">
                <div className="overflow-visible">
                  <table className="w-full min-w-[700px] border-collapse">
                    <thead>
                      <tr className="bg-white text-slate-600">
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-4 py-4 w-10">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 accent-[#0037b0] cursor-pointer"
                            checked={filteredInvoices.length > 0 && selectedIds.size === filteredInvoices.length}
                            onChange={toggleAll}
                          />
                        </th>
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-left text-[10px] font-extrabold uppercase tracking-widest text-slate-400 select-none">Invoice</th>
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-left text-[10px] font-extrabold uppercase tracking-widest text-slate-400 select-none">Client</th>
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-left text-[10px] font-extrabold uppercase tracking-widest text-slate-400 select-none">Status</th>
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-left text-[10px] font-extrabold uppercase tracking-widest text-slate-400 select-none">Date</th>
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-right text-[10px] font-extrabold uppercase tracking-widest text-slate-400 select-none">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y-0">
                      {filteredInvoices.map((invoice, index) => (
                        <tr
                          key={invoice.id}
                          className={cn(
                            "transition-all duration-150 hover:bg-[#eef4ff]/20",
                            selectedIds.has(invoice.id) ? "bg-[#0037b0]/[0.03]" : index % 2 === 0 ? "bg-transparent" : "bg-background/40"
                          )}
                        >
                          <td className="px-4 py-4">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-slate-300 accent-[#0037b0] cursor-pointer"
                              checked={selectedIds.has(invoice.id)}
                              onChange={() => toggleSelect(invoice.id)}
                            />
                          </td>
                          <td className="px-6 py-4">
                            <Link
                              to={`/invoices/${invoice.id}`}
                              className="font-semibold text-[#0037b0] hover:text-[#002e90] transition-colors text-sm"
                            >
                              {invoice.invoiceNumber}
                            </Link>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-[#0037b0]/5 text-[#0037b0] border border-[#0037b0]/8 flex items-center justify-center text-[11px] font-medium shrink-0 select-none">
                                {getInitials(invoice.client.name)}
                              </div>
                              <span className="font-medium text-slate-800 text-sm">{invoice.client.name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-left">
                            {renderStatusPill(invoice.status)}
                          </td>
                          <td className="px-6 py-4 text-xs font-medium text-slate-500">
                            {formatDate(invoice.issueDate)}
                          </td>
                          <td className="px-6 py-4 text-right font-semibold text-slate-900 tabular-nums text-sm">
                            {formatCurrency(invoice.total)}
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
              {filteredInvoices.map((invoice) => (
                <div 
                  key={invoice.id}
                  className="bg-white rounded-[24px] p-5 shadow-[0px_8px_24px_rgba(0,55,176,0.08)] border-0 transition-all duration-300 hover:shadow-[0px_12px_32px_rgba(0,55,176,0.12)] relative"
                >
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#0037b0]/5 text-[#0037b0] border border-[#0037b0]/8 flex items-center justify-center text-xs font-medium shrink-0 select-none">
                        {getInitials(invoice.client.name)}
                      </div>
                      <div>
                        <Link 
                          to={`/invoices/${invoice.id}`} 
                          className="font-semibold text-[#0037b0] hover:underline text-sm block"
                        >
                          {invoice.invoiceNumber}
                        </Link>
                        <span className="text-xs text-slate-550 font-medium mt-0.5 block">{invoice.client.name}</span>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-slate-900 tabular-nums">
                      {formatCurrency(invoice.total)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#eef4ff]/50">
                    <span className="text-xs text-slate-400 font-medium">
                      Issued: {formatDate(invoice.issueDate)}
                    </span>
                    {renderStatusPill(invoice.status)}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Pagination & Limit Selector */}
        {data && data.meta.total > 0 && (
          <div className="hidden md:flex mt-6 flex-row items-center justify-between gap-4 border-t border-[#eef4ff]/50 pt-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-semibold">Show:</span>
              <div className="relative inline-block text-left">
                <button
                  onClick={() => setLimitOpen(!limitOpen)}
                  className="h-9 px-3.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all flex items-center justify-between gap-2 shadow-[0px_4px_12px_rgba(0,55,176,0.01)] cursor-pointer min-w-[120px]"
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
                        "w-full text-left px-3.5 py-2.5 text-xs font-semibold transition-colors block cursor-pointer",
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
              Load More Invoices ({data.meta.total - limit} remaining)
            </Button>
          </div>
        )}
        </div>
      </div>

      {/* Mobile Floating Action Button */}
      <Link 
        to="/invoices/new" 
        className="absolute bottom-6 right-6 z-40 sm:hidden w-14 h-14 rounded-full bg-gradient-to-br from-[#0037b0] to-[#1d4ed8] text-white flex items-center justify-center shadow-[0px_8px_24px_rgba(0,55,176,0.25)] hover:scale-105 active:scale-95 transition-all"
        aria-label="New Invoice"
      >
        <HugeiconsIcon icon={PlusSignIcon} size={24} strokeWidth={1.5} />
      </Link>

      {/* Mobile slide-up bottom sheet for filters */}
      <BottomSheet
        isOpen={isMobileFiltersOpen}
        onClose={closeMobileFilters}
        title="Filter Invoices"
        onClearAll={() => setTempStatus('')}
      >
        {/* Scrollable Filters list */}
        <div className="flex-1 overflow-y-auto space-y-4 pb-6 select-none text-left">
          {/* Status Section */}
          <div className="bg-[#eef4ff]/35 rounded-2xl p-4">
            <h4 className="text-[10px] font-extrabold uppercase tracking-widest text-[#0037b0]/60 mb-3">Status</h4>
            <div className="grid grid-cols-2 gap-2">
              {([
                { label: 'All', value: '' },
                { label: 'Draft', value: 'DRAFT' },
                { label: 'Sent', value: 'SENT' },
                { label: 'Paid', value: 'PAID' },
                { label: 'Partially Paid', value: 'PARTIALLY_PAID' },
                { label: 'Overdue', value: 'OVERDUE' },
              ] as const).map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setTempStatus(opt.value)}
                  className={cn(
                    "py-2 px-3 rounded-full text-xs font-semibold transition-all text-center cursor-pointer border-0",
                    tempStatus === opt.value
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
              setStatus(tempStatus)
              setPage(1)
              closeMobileFilters()
            }}
            className="py-3 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-[#0037b0] to-[#1d4ed8] hover:opacity-95 transition-all min-h-[44px] border-0"
          >
            Apply Filters
          </Button>
        </div>
      </BottomSheet>
    </div>
  )
}
