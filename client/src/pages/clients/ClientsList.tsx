import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  PlusSignIcon,
  Search01Icon,
  Mail01Icon,
  Call02Icon,
  MoreVerticalIcon,
  ViewIcon,
  PencilEdit02Icon,
  Delete02Icon,
  ArrowDown01Icon,
  UserGroupIcon,
  FilterHorizontalIcon,
  Download04Icon,
  UserGroupIcon,
  FilterHorizontalIcon
} from '@hugeicons/core-free-icons'
import { Header } from '@/components/layout'
import { Button, Input, Card, CardContent, ConfirmDialog, EmptyState, DropdownPanel } from '@/components/ui'
import { BottomSheet } from '@/components/shared'
import { clientsApi } from '@/api'
import { cn, isActualMobileDevice } from '@/lib/utils'
import { toast } from 'sonner'
import { ClientsIcon } from '@/components/ui/CustomIcons'
import { useOverscrollBounce } from '@/hooks'


const getInitials = (name: string) => {
  const cleanName = name.replace(/^(Mrs\.|Mr\.|Dr\.|Prof\.)\s+/i, '').trim();
  const parts = cleanName.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function ClientsListPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'active' | 'inactive' | ''>('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null)
  const [limitOpen, setLimitOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [clientToDelete, setClientToDelete] = useState<{ id: string; name: string } | null>(null)
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false)
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false)
  const [tempStatus, setTempStatus] = useState<'active' | 'inactive' | ''>('')
  const scrollContainerRef = useOverscrollBounce<HTMLDivElement>()

  const openMobileFilters = () => {
    setTempStatus(status)
    setIsMobileFiltersOpen(true)
  }

  const closeMobileFilters = () => {
    setIsMobileFiltersOpen(false)
  }

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

  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['clients', { search, status, page, limit }],
    queryFn: () => clientsApi.list({ search, status: status || undefined, page, limit }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => clientsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      toast.success('Client deleted successfully')
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to delete client')
    },
  })

  return (
    <div className="flex flex-1 flex-col overflow-hidden relative min-h-0">
      <Header
        title="Clients"
        description="Manage your client list"
        icon={ClientsIcon}
        category="Directory"
        badgeText={data?.meta.total}
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                const rows = data?.data ?? []
                if (!rows.length) { toast.error('No clients to export'); return }
                const headers = ['Name', 'Email', 'Phone', 'Status', 'Invoices']
                const lines = rows.map(c => [
                  c.name, c.email ?? '', c.phone ?? '',
                  c.isActive ? 'Active' : 'Inactive',
                  c._count?.invoices ?? 0,
                ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
                const csv = [headers.join(','), ...lines].join('\n')
                const blob = new Blob([csv], { type: 'text/csv' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url; a.download = 'clients.csv'; a.click()
                URL.revokeObjectURL(url)
                toast.success('Clients exported')
              }}
            >
              <HugeiconsIcon icon={Download04Icon} size={16} className="mr-2" strokeWidth={1.5} />
              Export
            </Button>
            <Link to="/clients/new">
              <Button>
                <HugeiconsIcon icon={PlusSignIcon} size={16} className="mr-2" strokeWidth={1.5} />
                Add Client
              </Button>
            </Link>
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
                  placeholder="Search clients..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                  className="pl-11 rounded-xl h-10 bg-white border border-border"
                />
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
                    {status === 'active' ? 'Active Clients' : status === 'inactive' ? 'Inactive Clients' : 'All Clients'}
                  </span>
                  <HugeiconsIcon icon={ArrowDown01Icon} className={cn("h-4 w-4 text-slate-400 transition-transform duration-200 shrink-0", statusDropdownOpen && "rotate-180")} strokeWidth={1.5} />
                </button>

                <DropdownPanel
                  isOpen={statusDropdownOpen}
                  onClose={() => setStatusDropdownOpen(false)}
                  align="left"
                  widthClass="w-48"
                >
                  {([
                    { label: 'All Clients', value: '' },
                    { label: 'Active Clients', value: 'active' },
                    { label: 'Inactive Clients', value: 'inactive' },
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
                placeholder="Search clients..."
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

        {/* Clients Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : data?.data.length === 0 ? (
          <EmptyState
            icon={UserGroupIcon}
            title="No clients found"
            description="Build your customer list to start creating invoices and tracking payments."
            actionLabel="Add your first client"
            actionHref="/clients/new"
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
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-left text-[10px] font-extrabold uppercase tracking-widest text-slate-400 select-none">Client Name</th>
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-left text-[10px] font-extrabold uppercase tracking-widest text-slate-400 select-none">Email</th>
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-left text-[10px] font-extrabold uppercase tracking-widest text-slate-400 select-none">Phone</th>
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-left text-[10px] font-extrabold uppercase tracking-widest text-slate-400 select-none">Status</th>
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-center text-[10px] font-extrabold uppercase tracking-widest text-slate-400 select-none">Invoices</th>
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-right text-[10px] font-extrabold uppercase tracking-widest text-slate-400 select-none">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y-0">
                      {data?.data.map((client, index) => (
                        <tr 
                          key={client.id} 
                          className={cn(
                            "transition-all duration-150 hover:bg-[#eef4ff]/20",
                            index % 2 === 0 ? "bg-transparent" : "bg-[#eef4ff]/08"
                          )}
                        >
                          <td className="px-6 py-4 font-semibold text-slate-900">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-[#0037b0]/5 text-[#0037b0] border border-[#0037b0]/8 shadow-[0_2px_6px_rgba(0,55,176,0.01)] flex items-center justify-center text-[11px] font-medium shrink-0 select-none">
                                {getInitials(client.name)}
                              </div>
                              <Link to={`/clients/${client.id}`} className="font-semibold text-slate-900 hover:text-[#0037b0] transition-colors truncate max-w-[200px] block text-sm">
                                {client.name}
                              </Link>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-xs font-medium text-slate-500">
                            {client.email ? (
                              <span className="truncate max-w-[220px] block">
                                {client.email}
                              </span>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-xs font-medium text-slate-500">
                            {client.phone ? (
                              <span>{client.phone}</span>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-left">
                            <div className="flex items-center gap-2 select-none justify-start">
                              <span className={cn(
                                "h-1.5 w-1.5 rounded-full shrink-0",
                                client.isActive ? "bg-emerald-500" : "bg-slate-400"
                              )} />
                              <span className={cn(
                                "text-xs font-semibold tracking-wide",
                                client.isActive ? "text-emerald-700" : "text-slate-500"
                              )}>
                                {client.isActive ? 'Active' : 'Inactive'}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="inline-flex items-center justify-center min-w-8 h-6 bg-[#eef4ff] text-[#0037b0] px-2 rounded-full text-xs font-semibold tabular-nums">
                              {client._count?.invoices ?? 0}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right relative">
                            <div className="inline-block text-left relative">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveDropdown(activeDropdown === client.id ? null : client.id);
                                }}
                                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors cursor-pointer"
                              >
                                <HugeiconsIcon icon={MoreVerticalIcon} size={16} strokeWidth={1.5} />
                              </button>
  
                              <DropdownPanel
                                isOpen={activeDropdown === client.id}
                                onClose={() => setActiveDropdown(null)}
                                align="right"
                                widthClass="w-36"
                                zIndexClass="z-20"
                              >
                                <Link
                                  to={`/clients/${client.id}`}
                                  onClick={() => setActiveDropdown(null)}
                                  className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors rounded-lg"
                                >
                                  <HugeiconsIcon icon={ViewIcon} size={14} className="text-slate-400" strokeWidth={1.5} />
                                  View Details
                                </Link>
                                <Link
                                  to={`/clients/${client.id}/edit`}
                                  onClick={() => setActiveDropdown(null)}
                                  className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors rounded-lg"
                                >
                                  <HugeiconsIcon icon={PencilEdit02Icon} size={14} className="text-slate-400" strokeWidth={1.5} />
                                  Edit Client
                                </Link>
                                <button
                                  onClick={() => {
                                    setClientToDelete({ id: client.id, name: client.name });
                                    setDeleteConfirmOpen(true);
                                    setActiveDropdown(null);
                                  }}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer rounded-lg"
                                >
                                  <HugeiconsIcon icon={Delete02Icon} size={14} className="text-rose-500" strokeWidth={1.5} />
                                  Delete Client
                                </button>
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
              {data?.data.map((client) => (
                <div 
                  key={client.id}
                  onClick={() => navigate(`/clients/${client.id}`)}
                  className="bg-white rounded-[24px] p-5 shadow-[0px_8px_24px_rgba(0,55,176,0.08)] border border-[#eef4ff]/50 transition-all duration-300 hover:shadow-[0px_12px_32px_rgba(0,55,176,0.12)] active:scale-[0.99] cursor-pointer relative flex flex-col gap-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-xl bg-[#0037b0]/5 text-[#0037b0] border border-[#0037b0]/8 flex items-center justify-center text-xs font-bold shrink-0 select-none">
                        {getInitials(client.name)}
                      </div>
                      <div className="min-w-0">
                        <span className="font-semibold text-slate-900 text-sm truncate block">
                          {client.name}
                        </span>
                      </div>
                    </div>

                    {/* Inline direct actions with generous tap targets */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/clients/${client.id}/edit`);
                        }}
                        className="w-11 h-11 rounded-full flex items-center justify-center bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer border border-[#eef4ff]/60 shrink-0"
                        aria-label="Edit Client"
                      >
                        <HugeiconsIcon icon={PencilEdit02Icon} size={16} strokeWidth={1.5} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setClientToDelete({ id: client.id, name: client.name });
                          setDeleteConfirmOpen(true);
                        }}
                        className="w-11 h-11 rounded-full flex items-center justify-center bg-rose-50/50 text-rose-600 hover:bg-rose-100/50 hover:text-rose-700 transition-colors cursor-pointer border border-rose-500/10 shrink-0"
                        aria-label="Delete Client"
                      >
                        <HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={1.5} />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    {client.email ? (
                      <a 
                        href={`mailto:${client.email}`} 
                        onClick={(e) => handleEmailClick(e, client.email!)}
                        className="flex items-center gap-2.5 text-xs font-medium text-slate-600 hover:text-[#0037b0] transition-colors py-2 min-h-[44px]"
                      >
                        <span className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center shrink-0">
                          <HugeiconsIcon icon={Mail01Icon} size={14} className="text-slate-400" strokeWidth={1.5} />
                        </span>
                        <span className="truncate max-w-[220px]">{client.email}</span>
                      </a>
                    ) : (
                      <div className="flex items-center gap-2.5 text-xs text-slate-350 italic py-2 min-h-[44px]">
                        <span className="w-8 h-8 rounded-full bg-slate-50/50 flex items-center justify-center shrink-0">
                          <HugeiconsIcon icon={Mail01Icon} size={14} className="text-slate-300" strokeWidth={1.5} />
                        </span>
                        <span>No email provided</span>
                      </div>
                    )}

                    {client.phone ? (
                      <a 
                        href={`tel:${client.phone}`} 
                        onClick={(e) => handlePhoneClick(e, client.phone!)}
                        className="flex items-center gap-2.5 text-xs font-medium text-slate-650 hover:text-[#0037b0] transition-colors py-2 min-h-[44px]"
                      >
                        <span className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center shrink-0">
                          <HugeiconsIcon icon={Call02Icon} size={14} className="text-slate-400" strokeWidth={1.5} />
                        </span>
                        <span>{client.phone}</span>
                      </a>
                    ) : (
                      <div className="flex items-center gap-2.5 text-xs text-slate-350 italic py-2 min-h-[44px]">
                        <span className="w-8 h-8 rounded-full bg-slate-50/50 flex items-center justify-center shrink-0">
                          <HugeiconsIcon icon={Call02Icon} size={14} className="text-slate-300" strokeWidth={1.5} />
                        </span>
                        <span>No phone number</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-1 pt-3 border-t border-[#eef4ff]/50">
                    <div className="flex items-center gap-1.5 select-none">
                      <span className={cn(
                        "h-1.5 w-1.5 rounded-full shrink-0",
                        client.isActive ? "bg-emerald-500" : "bg-slate-400"
                      )} />
                      <span className={cn(
                        "text-xs font-semibold tracking-wide",
                        client.isActive ? "text-emerald-700" : "text-slate-500"
                      )}>
                        {client.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="text-xs font-semibold text-[#434655]">
                      Invoices: <span className="font-semibold text-slate-800 tabular-nums bg-[#eef4ff]/50 px-2 py-1 rounded-lg ml-1">{client._count?.invoices ?? 0}</span>
                    </div>
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
              Load More Clients ({data.meta.total - limit} remaining)
            </Button>
          </div>
        )}
      </div>

      {/* Mobile Floating Action Button */}
      <Link 
        to="/clients/new" 
        className="absolute bottom-6 right-6 z-40 sm:hidden w-14 h-14 rounded-full bg-gradient-to-br from-[#0037b0] to-[#1d4ed8] text-white flex items-center justify-center shadow-[0px_8px_24px_rgba(0,55,176,0.25)] hover:scale-105 active:scale-95 transition-all"
        aria-label="Add Client"
      >
        <HugeiconsIcon icon={PlusSignIcon} size={24} strokeWidth={1.5} />
      </Link>

      {/* Mobile slide-up bottom sheet for filters */}
      <BottomSheet
        isOpen={isMobileFiltersOpen}
        onClose={closeMobileFilters}
        title="Filter Clients"
        onClearAll={() => setTempStatus('')}
      >
        {/* Scrollable Filters list */}
        <div className="flex-1 overflow-y-auto space-y-4 pb-6 select-none text-left">
          {/* Status Section */}
          <div className="bg-[#eef4ff]/35 rounded-2xl p-4">
            <h4 className="text-[10px] font-extrabold uppercase tracking-widest text-[#0037b0]/60 mb-3">Status</h4>
            <div className="grid grid-cols-3 gap-2">
              {([
                { label: 'All', value: '' },
                { label: 'Active', value: 'active' },
                { label: 'Inactive', value: 'inactive' }
              ] as const).map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setTempStatus(opt.value)}
                  className={cn(
                    "py-2 px-3 rounded-full text-xs font-semibold transition-all text-center cursor-pointer border-0",
                    tempStatus === opt.value
                      ? "bg-[#0037b0] text-white shadow-sm font-bold"
                      : "bg-slate-100 text-slate-650 hover:bg-slate-200"
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

      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        onClose={() => {
          setDeleteConfirmOpen(false)
          setClientToDelete(null)
        }}
        onConfirm={() => {
          if (clientToDelete) {
            deleteMutation.mutate(clientToDelete.id, {
              onSuccess: () => {
                setDeleteConfirmOpen(false)
                setClientToDelete(null)
              }
            })
          }
        }}
        title="Delete Client"
        description={`Are you sure you want to delete ${clientToDelete?.name}? This action cannot be undone and will delete all associated records.`}
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous={true}
        isLoading={deleteMutation.isPending}
      />
        </div>
      </div>
    )
  }
