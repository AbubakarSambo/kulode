import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  PencilEdit02Icon,
  Delete02Icon,
  PlusSignIcon,
  Mail01Icon,
  Call02Icon,
  Location01Icon,
  Invoice03Icon,
  ArrowDown01Icon,
  ArrowLeft02Icon
} from '@hugeicons/core-free-icons'
import { Header } from '@/components/layout'
import { Button, Card, CardContent, CardHeader, CardTitle, ConfirmDialog } from '@/components/ui'
import { clientsApi } from '@/api'
import { formatCurrency, formatDate, isActualMobileDevice, cn } from '@/lib/utils'
import { posthog } from '@/lib/posthog'
import type { Client, InvoiceStatus } from '@/types'
import { useOverscrollBounce } from '@/hooks'


interface ClientWithInvoices extends Client {
  invoices?: {
    id: string
    invoiceNumber: string
    issueDate: string
    status: InvoiceStatus
    total: number
    amountPaid?: number
  }[]
}

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
    <div className="flex items-center gap-1.5 select-none justify-start">
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", config.dot)} />
      <span className={cn("text-xs font-semibold tracking-wide", config.text)}>
        {config.label}
      </span>
    </div>
  )
}

const getInitials = (name: string) => {
  const cleanName = name.replace(/^(Mrs\.|Mr\.|Dr\.|Prof\.)\s+/i, '').trim();
  const parts = cleanName.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [accordionOpen, setAccordionOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<'ALL' | 'UNPAID' | 'OVERDUE' | 'PAID'>('ALL')
  const scrollContainerRef = useOverscrollBounce<HTMLDivElement>()

  const { data: client, isLoading } = useQuery<ClientWithInvoices>({
    queryKey: ['clients', id],
    queryFn: () => clientsApi.get(id!) as Promise<ClientWithInvoices>,
    enabled: !!id,
  })

  const deleteMutation = useMutation({
    mutationFn: () => clientsApi.delete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      posthog.capture('client_deleted', { client_id: id })
      toast.success('Client deleted')
      navigate('/clients')
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (error: any) => {
      toast.error('Failed to delete client', {
        description: error.response?.data?.message,
      })
    },
  })

  const handleEmailClick = (e: React.MouseEvent<HTMLAnchorElement>, email: string) => {
    if (!isActualMobileDevice()) {
      e.preventDefault()
      e.stopPropagation()
      navigator.clipboard.writeText(email)
      toast.success('Email copied to clipboard')
    }
  }

  const handlePhoneClick = (e: React.MouseEvent<HTMLAnchorElement>, phone: string) => {
    if (!isActualMobileDevice()) {
      e.preventDefault()
      e.stopPropagation()
      navigator.clipboard.writeText(phone)
      toast.success('Phone number copied to clipboard')
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!client) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center">
        <p className="text-muted-foreground">Client not found</p>
        <Button className="mt-4" onClick={() => navigate('/clients')}>
          Back to Clients
        </Button>
      </div>
    )
  }

  // Calculate summaries from client.invoices
  const invoices = client.invoices ?? []
  const activeInvoices = invoices.filter(inv => inv.status !== 'CANCELLED' && inv.status !== 'DRAFT')
  const totalInvoiced = activeInvoices.reduce((sum, inv) => sum + Number(inv.total), 0)
  const totalPaid = activeInvoices.reduce((sum, inv) => sum + Number(inv.amountPaid ?? 0), 0)
  const totalOutstanding = Math.max(0, totalInvoiced - totalPaid)

  // Filter invoices for display based on selection
  const filteredInvoices = invoices.filter((invoice) => {
    if (invoiceStatusFilter === 'ALL') return true
    if (invoiceStatusFilter === 'UNPAID') {
      return invoice.status === 'SENT' || invoice.status === 'PARTIALLY_PAID' || invoice.status === 'OVERDUE'
    }
    if (invoiceStatusFilter === 'OVERDUE') return invoice.status === 'OVERDUE'
    if (invoiceStatusFilter === 'PAID') return invoice.status === 'PAID'
    return true
  })

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background">
      <Header
        title={client.name}
        description={client.isActive ? 'Active client' : 'Inactive client'}
        action={
          <div className="flex gap-2">
            <Link to={`/invoices/new?clientId=${client.id}`}>
              <Button className="bg-gradient-to-r from-[#0037b0] to-[#1d4ed8] text-white shadow-[0px_4px_12px_rgba(0,55,176,0.15)] hover:opacity-95 rounded-xl h-10 px-4">
                <HugeiconsIcon icon={PlusSignIcon} size={16} className="mr-2" strokeWidth={1.5} />
                New Invoice
              </Button>
            </Link>
            <Link to={`/clients/${client.id}/edit`}>
              <Button variant="outline" className="rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 h-10 px-4">
                <HugeiconsIcon icon={PencilEdit02Icon} size={16} className="mr-2" strokeWidth={1.5} />
                Edit
              </Button>
            </Link>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(true)} className="rounded-xl border border-slate-200 hover:bg-slate-50 text-rose-600 h-10 px-4">
              <HugeiconsIcon icon={Delete02Icon} size={16} className="mr-2" strokeWidth={1.5} />
              Delete
            </Button>
          </div>
        }
      />

      <div ref={scrollContainerRef} className="flex-1 overflow-auto p-4 sm:p-6">
        {/* Mobile Back Navigation */}
        <div className="flex items-center justify-between mb-4 sm:hidden">
          <Link to="/clients" className="inline-flex items-center text-xs font-bold text-[#0037b0] hover:underline gap-1 min-h-[44px]">
            <HugeiconsIcon icon={ArrowLeft02Icon} size={16} />
            Back to Clients
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Client Info Hero Card */}
          <Card className="lg:col-span-1 overflow-hidden border-0 bg-white shadow-[0px_12px_32px_rgba(0,55,176,0.08)] rounded-[24px]">
            {/* Premium Editorial Header for Card */}
            <div className="p-6 pb-4 bg-gradient-to-b from-[#eef4ff]/40 to-transparent flex flex-col items-center text-center sm:text-left sm:items-start sm:flex-row gap-4 relative">
              {/* Soft initials container */}
              <div className="w-16 h-16 rounded-[20px] bg-[#0037b0]/5 text-[#0037b0] border border-[#0037b0]/8 flex items-center justify-center font-extrabold text-xl shrink-0 select-none">
                {getInitials(client.name)}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-extrabold tracking-tight text-slate-800 leading-tight truncate pr-16 sm:pr-0">
                  {client.name}
                </h2>
                <div className="flex items-center gap-1.5 mt-1 justify-center sm:justify-start">
                  <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", client.isActive ? 'bg-emerald-500' : 'bg-slate-400')} />
                  <span className={cn("text-xs font-semibold tracking-wide", client.isActive ? 'text-emerald-700' : 'text-slate-500')}>
                    {client.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>

              {/* Mobile Actions: Edit & Delete Circular Buttons */}
              <div className="absolute right-4 top-4 flex items-center gap-2 sm:hidden">
                <Link to={`/clients/${client.id}/edit`}>
                  <button className="w-9 h-9 rounded-full bg-white border border-[#eef4ff] text-[#0037b0] hover:bg-[#eef4ff]/10 flex items-center justify-center shadow-sm select-none cursor-pointer">
                    <HugeiconsIcon icon={PencilEdit02Icon} size={15} strokeWidth={1.5} />
                  </button>
                </Link>
                <button
                  onClick={() => setDeleteConfirmOpen(true)}
                  className="w-9 h-9 rounded-full bg-white border border-rose-50 text-rose-600 hover:bg-rose-50 flex items-center justify-center shadow-sm select-none cursor-pointer"
                >
                  <HugeiconsIcon icon={Delete02Icon} size={15} strokeWidth={1.5} />
                </button>
              </div>
            </div>

            <CardContent className="space-y-4 pt-4">
              <div className="space-y-3">
                {client.email && (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#eef4ff]/60 text-[#0037b0]/80 flex items-center justify-center shrink-0">
                      <HugeiconsIcon icon={Mail01Icon} size={15} strokeWidth={1.5} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-0.5">Email Address</p>
                      <a 
                        href={`mailto:${client.email}`} 
                        onClick={(e) => handleEmailClick(e, client.email!)}
                        className="text-xs font-semibold text-[#0037b0] hover:underline block truncate"
                      >
                        {client.email}
                      </a>
                    </div>
                  </div>
                )}
                {client.phone && (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#eef4ff]/60 text-[#0037b0]/80 flex items-center justify-center shrink-0">
                      <HugeiconsIcon icon={Call02Icon} size={15} strokeWidth={1.5} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-0.5">Phone Number</p>
                      <a 
                        href={`tel:${client.phone}`} 
                        onClick={(e) => handlePhoneClick(e, client.phone!)}
                        className="text-xs font-semibold text-slate-600 hover:underline block truncate"
                      >
                        {client.phone}
                      </a>
                    </div>
                  </div>
                )}
              </div>

              {/* Accordion Wrapper for Secondary Metadata */}
              {(client.address || client.notes) && (
                <div className="pt-2 border-t border-[#eef4ff]/30">
                  <button
                    onClick={() => setAccordionOpen(!accordionOpen)}
                    className="flex w-full items-center justify-between py-2 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors cursor-pointer min-h-[44px]"
                  >
                    <span className="tracking-wider">SECONDARY DETAILS</span>
                    <HugeiconsIcon
                      icon={ArrowDown01Icon}
                      size={16}
                      className={cn("transition-transform duration-200 text-slate-400", accordionOpen && "rotate-180")}
                    />
                  </button>
                  
                  <div className={cn(
                    "space-y-4 overflow-hidden transition-all duration-300 ease-in-out",
                    accordionOpen ? "max-h-[500px] opacity-100 mt-2" : "max-h-0 opacity-0"
                  )}>
                    {client.address && (
                      <div className="flex items-start gap-3 pt-1">
                        <div className="w-8 h-8 rounded-lg bg-[#eef4ff]/60 text-[#0037b0]/80 flex items-center justify-center shrink-0 mt-0.5">
                          <HugeiconsIcon icon={Location01Icon} size={15} strokeWidth={1.5} />
                        </div>
                        <div className="flex-1">
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-0.5">Billing Address</p>
                          <span className="text-xs font-medium text-slate-660 leading-relaxed block">{client.address}</span>
                        </div>
                      </div>
                    )}
                    {client.notes && (
                      <div className="rounded-xl bg-[#eef4ff]/20 p-3.5 border border-[#eef4ff]/10">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1.5">Internal Notes</p>
                        <p className="text-xs font-medium text-slate-650 leading-relaxed whitespace-pre-wrap">{client.notes}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Invoices List */}
          <Card className="lg:col-span-2 border-0 bg-white shadow-[0px_12px_32px_rgba(0,55,176,0.08)] rounded-[24px]">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-extrabold text-slate-800">
                <HugeiconsIcon icon={Invoice03Icon} size={18} className="text-[#0037b0]" strokeWidth={1.5} />
                Invoices
              </CardTitle>
              {client.invoices && client.invoices.length > 0 && (() => {
                const outstanding = client.invoices!
                  .filter(inv => inv.status !== 'PAID' && inv.status !== 'CANCELLED')
                  .reduce((sum, inv) => sum + Number(inv.total), 0)
                return outstanding > 0 ? (
                  <div className="text-right">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Outstanding</p>
                    <p className="text-sm font-extrabold text-rose-600">{formatCurrency(outstanding)}</p>
                  </div>
                ) : null
              })()}
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Financial Metrics Summary Strip */}
              {invoices.length > 0 && (
                <div className="flex flex-col gap-3 sm:grid sm:grid-cols-3 sm:gap-4 p-4 rounded-2xl bg-background/50 border border-[#eef4ff]/25">
                  {/* Outstanding */}
                  <div className="flex sm:flex-col justify-between items-center sm:items-start gap-1">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" />
                      Outstanding
                    </p>
                    <p className="text-sm sm:text-base font-bold text-rose-600 tracking-tight tabular-nums">
                      {formatCurrency(totalOutstanding)}
                    </p>
                  </div>
                  
                  {/* Total Paid */}
                  <div className="flex sm:flex-col justify-between items-center sm:items-start gap-1 border-t sm:border-t-0 sm:border-l border-[#eef4ff]/60 pt-2.5 sm:pt-0 sm:pl-4">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                      Total Paid
                    </p>
                    <p className="text-sm sm:text-base font-bold text-emerald-600 tracking-tight tabular-nums">
                      {formatCurrency(totalPaid)}
                    </p>
                  </div>
                  
                  {/* Invoiced */}
                  <div className="flex sm:flex-col justify-between items-center sm:items-start gap-1 border-t sm:border-t-0 sm:border-l border-[#eef4ff]/60 pt-2.5 sm:pt-0 sm:pl-4">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#0037b0] shrink-0" />
                      Invoiced
                    </p>
                    <p className="text-sm sm:text-base font-bold text-slate-700 tracking-tight tabular-nums">
                      {formatCurrency(totalInvoiced)}
                    </p>
                  </div>
                </div>
              )}

              {/* Status Filter Chips */}
              {invoices.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-2 px-2 scrollbar-none">
                  {([
                    { label: 'All', value: 'ALL' },
                    { label: 'Unpaid', value: 'UNPAID' },
                    { label: 'Overdue', value: 'OVERDUE' },
                    { label: 'Paid', value: 'PAID' },
                  ] as const).map((opt) => {
                    const isActive = invoiceStatusFilter === opt.value
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setInvoiceStatusFilter(opt.value)}
                        className={cn(
                          "rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer border border-transparent whitespace-nowrap select-none",
                          isActive
                            ? "bg-[#0037b0]/10 text-[#0037b0] font-extrabold"
                            : "bg-[#eef4ff]/50 text-slate-550 hover:bg-[#eef4ff] hover:text-[#434655]"
                        )}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Invoice Lists */}
              {invoices.length === 0 ? (
                <div className="py-12 text-center bg-slate-50/20 rounded-2xl border border-dashed border-[#eef4ff]/30">
                  <p className="text-sm font-semibold text-slate-400">No invoices yet</p>
                  <Link to={`/invoices/new?clientId=${client.id}`}>
                    <Button className="mt-4 bg-gradient-to-r from-[#0037b0] to-[#1d4ed8] text-white rounded-xl font-bold min-h-[44px]">
                      Create First Invoice
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {invoiceStatusFilter === 'ALL' ? (
                    <>
                      {/* Render Active/Actionable Invoices list vs settled/draft accordion */}
                      {(() => {
                        const actionable = filteredInvoices.filter(inv => 
                          inv.status === 'OVERDUE' || inv.status === 'SENT' || inv.status === 'PARTIALLY_PAID'
                        )
                        const settled = filteredInvoices.filter(inv => 
                          inv.status === 'PAID' || inv.status === 'DRAFT' || inv.status === 'CANCELLED'
                        )

                        return (
                          <div className="space-y-4">
                            {actionable.length > 0 && (
                              <div className="space-y-2">
                                <p className="text-[10px] font-extrabold tracking-widest text-[#0037b0]/80 uppercase">Actionable Invoices</p>
                                <div className="space-y-3">
                                  {actionable.map((invoice) => (
                                    <Link
                                      key={invoice.id}
                                      to={`/invoices/${invoice.id}`}
                                      className="flex items-center justify-between rounded-[18px] bg-white border border-[#eef4ff]/60 hover:bg-[#eef4ff]/25 p-3.5 transition-all duration-200 hover:shadow-sm"
                                    >
                                      <div>
                                        <p className="font-semibold text-slate-700 text-sm hover:text-[#0037b0] transition-colors">{invoice.invoiceNumber}</p>
                                        <p className="text-xs font-semibold text-slate-400 mt-0.5">
                                          {formatDate(invoice.issueDate)}
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-4">
                                        {renderStatusPill(invoice.status)}
                                        <span className="font-semibold text-slate-900 text-sm">{formatCurrency(invoice.total)}</span>
                                      </div>
                                    </Link>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Settled Accordion */}
                            {settled.length > 0 && (
                              <div className="border-t border-[#eef4ff]/30 pt-3">
                                <button
                                  onClick={() => setHistoryOpen(!historyOpen)}
                                  className="flex w-full items-center justify-between py-2 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors cursor-pointer min-h-[44px]"
                                >
                                  <span className="tracking-wider">HISTORICAL & DRAFT INVOICES ({settled.length})</span>
                                  <HugeiconsIcon
                                    icon={ArrowDown01Icon}
                                    size={16}
                                    className={cn("transition-transform duration-200 text-slate-400", historyOpen && "rotate-180")}
                                  />
                                </button>

                                <div className={cn(
                                  "space-y-3 overflow-hidden transition-all duration-300 ease-in-out",
                                  historyOpen ? "max-h-[800px] opacity-100 mt-2" : "max-h-0 opacity-0"
                                )}>
                                  {settled.map((invoice) => (
                                    <Link
                                      key={invoice.id}
                                      to={`/invoices/${invoice.id}`}
                                      className="flex items-center justify-between rounded-[18px] bg-slate-50/40 border border-[#eef4ff]/30 hover:bg-[#eef4ff]/25 p-3.5 transition-all duration-200"
                                    >
                                      <div>
                                        <p className="font-semibold text-slate-600 text-sm hover:text-[#0037b0] transition-colors">{invoice.invoiceNumber}</p>
                                        <p className="text-xs font-semibold text-slate-400 mt-0.5">
                                          {formatDate(invoice.issueDate)}
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-4">
                                        {renderStatusPill(invoice.status)}
                                        <span className="font-semibold text-slate-700 text-sm">{formatCurrency(invoice.total)}</span>
                                      </div>
                                    </Link>
                                  ))}
                                </div>
                              </div>
                            )}

                            {actionable.length === 0 && settled.length === 0 && (
                              <p className="text-xs text-slate-400 text-center py-6">No invoices found for this client.</p>
                            )}
                          </div>
                        )
                      })()}
                    </>
                  ) : (
                    /* Flat filtered list display when user is actively drilling down */
                    <div className="space-y-3">
                      {filteredInvoices.length > 0 ? (
                        filteredInvoices.map((invoice) => (
                          <Link
                            key={invoice.id}
                            to={`/invoices/${invoice.id}`}
                            className="flex items-center justify-between rounded-[18px] bg-white border border-[#eef4ff]/60 hover:bg-[#eef4ff]/25 p-3.5 transition-all duration-200 hover:shadow-sm animate-in fade-in-50 duration-150"
                          >
                            <div>
                              <p className="font-semibold text-slate-700 text-sm hover:text-[#0037b0] transition-colors">{invoice.invoiceNumber}</p>
                              <p className="text-xs font-semibold text-slate-400 mt-0.5">
                                {formatDate(invoice.issueDate)}
                              </p>
                            </div>
                            <div className="flex items-center gap-4">
                              {renderStatusPill(invoice.status)}
                              <span className="font-semibold text-slate-900 text-sm">{formatCurrency(invoice.total)}</span>
                            </div>
                          </Link>
                        ))
                      ) : (
                        <p className="text-xs text-slate-400 text-center py-6 font-semibold">No invoices match the selected status.</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Mobile Floating Action Button (New Invoice for this client) */}
      <Link 
        to={`/invoices/new?clientId=${client.id}`} 
        className="fixed bottom-28 right-6 z-40 sm:hidden w-14 h-14 rounded-full bg-gradient-to-br from-[#0037b0] to-[#1d4ed8] text-white flex items-center justify-center shadow-[0px_8px_24px_rgba(0,55,176,0.25)] hover:scale-105 active:scale-95 transition-all"
        aria-label="New Invoice"
      >
        <HugeiconsIcon icon={PlusSignIcon} size={24} strokeWidth={1.5} />
      </Link>

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
        title="Delete Client"
        description={`Are you sure you want to delete ${client.name}? This action cannot be undone and will delete all associated records.`}
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous={true}
        isLoading={deleteMutation.isPending}
      />
    </div>
  )
}
