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
  Download04Icon,
} from '@hugeicons/core-free-icons'
import { Header } from '@/components/layout'
import { Button, Input, Card, CardContent } from '@/components/ui'
import { clientsApi } from '@/api'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { ClientsIcon } from '@/components/ui/CustomIcons'

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
    <div className="flex flex-1 flex-col overflow-hidden">
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

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {/* Filters and Search */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between stagger-in sticky top-0 md:static z-20 bg-[#f8f9ff]/95 backdrop-blur-sm py-3 -mx-4 px-4 md:-mx-0 md:px-0 md:bg-transparent md:py-0 md:mb-6 border-b border-[#eef4ff]/30 md:border-b-0">
          {/* Search bar */}
          <div className="relative flex-1 max-w-sm">
            <HugeiconsIcon icon={Search01Icon} size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" strokeWidth={1.5} />
            <Input
              placeholder="Search clients..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="pl-11 rounded-xl"
            />
          </div>

          {/* Status Filters */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-2 whitespace-nowrap">Status:</span>
            {([
              { label: 'All Clients', value: '' },
              { label: 'Active', value: 'active' },
              { label: 'Inactive', value: 'inactive' },
            ] as const).map((opt) => {
              const isActive = status === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => { setStatus(opt.value); setPage(1); }}
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

        {/* Clients Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : data?.data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground">No clients found</p>
            <Link to="/clients/new">
              <Button className="mt-4">Add your first client</Button>
            </Link>
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
  
                              {activeDropdown === client.id && (
                                <>
                                  {/* Backdrop */}
                                  <div 
                                    className="fixed inset-0 z-10" 
                                    onClick={() => setActiveDropdown(null)}
                                  />
                                  <div className="absolute right-0 mt-1 w-32 rounded-xl bg-white py-1 shadow-lg ring-1 ring-black/5 focus:outline-none z-20 animate-in fade-in slide-in-from-top-1 duration-150 text-left">
                                    <Link
                                      to={`/clients/${client.id}`}
                                      onClick={() => setActiveDropdown(null)}
                                      className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                                    >
                                      <HugeiconsIcon icon={ViewIcon} size={14} className="text-slate-400" strokeWidth={1.5} />
                                      View Details
                                    </Link>
                                    <Link
                                      to={`/clients/${client.id}/edit`}
                                      onClick={() => setActiveDropdown(null)}
                                      className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                                    >
                                      <HugeiconsIcon icon={PencilEdit02Icon} size={14} className="text-slate-400" strokeWidth={1.5} />
                                      Edit Client
                                    </Link>
                                    <button
                                      onClick={() => {
                                        if (window.confirm(`Are you sure you want to delete ${client.name}?`)) {
                                          deleteMutation.mutate(client.id);
                                        }
                                        setActiveDropdown(null);
                                      }}
                                      className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                    >
                                      <HugeiconsIcon icon={Delete02Icon} size={14} className="text-rose-500" strokeWidth={1.5} />
                                      Delete Client
                                    </button>
                                  </div>
                                </>
                              )}
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
                  className="bg-white rounded-[24px] p-5 shadow-[0px_8px_24px_rgba(0,55,176,0.03)] border border-[#eef4ff]/50 transition-all duration-300 hover:shadow-[0px_12px_32px_rgba(0,55,176,0.06)] active:scale-[0.99] cursor-pointer relative flex flex-col gap-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-[#0037b0]/5 text-[#0037b0] border border-[#0037b0]/8 flex items-center justify-center text-xs font-bold shrink-0 select-none">
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
                        className="w-10 h-10 rounded-full flex items-center justify-center bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer border border-[#eef4ff]/60"
                        aria-label="Edit Client"
                      >
                        <HugeiconsIcon icon={PencilEdit02Icon} size={15} strokeWidth={1.5} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Are you sure you want to delete ${client.name}?`)) {
                            deleteMutation.mutate(client.id);
                          }
                        }}
                        className="w-10 h-10 rounded-full flex items-center justify-center bg-rose-50/50 text-rose-600 hover:bg-rose-100/50 hover:text-rose-700 transition-colors cursor-pointer border border-rose-500/10"
                        aria-label="Delete Client"
                      >
                        <HugeiconsIcon icon={Delete02Icon} size={15} strokeWidth={1.5} />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    {client.email ? (
                      <a 
                        href={`mailto:${client.email}`} 
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-2.5 text-xs font-medium text-slate-600 hover:text-[#0037b0] transition-colors py-1 min-h-[36px]"
                      >
                        <span className="w-7 h-7 rounded-full bg-slate-50 flex items-center justify-center shrink-0">
                          <HugeiconsIcon icon={Mail01Icon} size={13} className="text-slate-400" strokeWidth={1.5} />
                        </span>
                        <span className="truncate max-w-[220px]">{client.email}</span>
                      </a>
                    ) : (
                      <div className="flex items-center gap-2.5 text-xs text-slate-350 italic py-1 min-h-[36px]">
                        <span className="w-7 h-7 rounded-full bg-slate-50/50 flex items-center justify-center shrink-0">
                          <HugeiconsIcon icon={Mail01Icon} size={13} className="text-slate-300" strokeWidth={1.5} />
                        </span>
                        <span>No email provided</span>
                      </div>
                    )}

                    {client.phone ? (
                      <a 
                        href={`tel:${client.phone}`} 
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-2.5 text-xs font-medium text-slate-650 hover:text-[#0037b0] transition-colors py-1 min-h-[36px]"
                      >
                        <span className="w-7 h-7 rounded-full bg-slate-50 flex items-center justify-center shrink-0">
                          <HugeiconsIcon icon={Call02Icon} size={13} className="text-slate-400" strokeWidth={1.5} />
                        </span>
                        <span>{client.phone}</span>
                      </a>
                    ) : (
                      <div className="flex items-center gap-2.5 text-xs text-slate-350 italic py-1 min-h-[36px]">
                        <span className="w-7 h-7 rounded-full bg-slate-50/50 flex items-center justify-center shrink-0">
                          <HugeiconsIcon icon={Call02Icon} size={13} className="text-slate-300" strokeWidth={1.5} />
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
                  <HugeiconsIcon icon={ArrowDown01Icon} className={cn("h-3.5 w-3.5 text-slate-400 transition-transform duration-200", limitOpen && "rotate-180")} strokeWidth={1.5} />
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

      {/* Mobile Floating Action Button */}
      <Link 
        to="/clients/new" 
        className="fixed bottom-28 right-6 z-40 sm:hidden w-14 h-14 rounded-full bg-gradient-to-br from-[#0037b0] to-[#1d4ed8] text-white flex items-center justify-center shadow-[0px_8px_24px_rgba(0,55,176,0.25)] hover:scale-105 active:scale-95 transition-all"
        aria-label="Add Client"
      >
        <HugeiconsIcon icon={PlusSignIcon} size={24} strokeWidth={1.5} />
      </Link>
    </div>
  )
}
