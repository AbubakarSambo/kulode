import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  PlusSignIcon,
  Search01Icon,
  UserIcon,
  Mail01Icon,
  Call02Icon,
  Store04Icon,
  MoreVerticalIcon,
  ViewIcon,
  PencilEdit02Icon,
  Delete02Icon,
  ArrowDown01Icon
} from '@hugeicons/core-free-icons'
import { Header } from '@/components/layout'
import { Button, Input, Card, CardContent, ConfirmDialog, EmptyState, DropdownPanel } from '@/components/ui'
import { vendorsApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { VendorsIcon } from '@/components/ui/CustomIcons'
import { useOverscrollBounce } from '@/hooks'
import { cn, isActualMobileDevice } from '@/lib/utils'
import { toast } from 'sonner'
import { useSubscription } from '@/hooks/useSubscription'


const PAYOUT_STATUS_STYLES: Record<string, { label: string; dot: string; text: string }> = {
  ACTIVE: { label: 'Payouts Active', dot: 'bg-emerald-500', text: 'text-emerald-700' },
  PENDING: { label: 'Pending Review', dot: 'bg-amber-500', text: 'text-amber-700' },
  FAILED: { label: 'Setup Failed', dot: 'bg-rose-500', text: 'text-rose-700' },
}

const getPayoutStatusDisplay = (status?: string | null) =>
  (status && PAYOUT_STATUS_STYLES[status]) || { label: 'Not Set Up', dot: 'bg-slate-400', text: 'text-slate-500' }

const getInitials = (name: string) => {
  const cleanName = name.replace(/^(Mrs\.|Mr\.|Dr\.|Prof\.)\s+/i, '').trim();
  const parts = cleanName.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function VendorsListPage() {
  const scrollContainerRef = useOverscrollBounce<HTMLDivElement>()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(100)
  const [limitOpen, setLimitOpen] = useState(false)
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [vendorToDelete, setVendorToDelete] = useState<{ id: string; name: string } | null>(null)

  const user = useAuthStore((state) => state.user)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { isReadOnlyMode: isExpired } = useSubscription()


  const canCreate = !!user?.roles.some((r) => r === 'SUPER_ADMIN' || r === 'ADMIN')

  const { data, isLoading } = useQuery({
    queryKey: ['vendors', { search, page, limit }],
    queryFn: () => vendorsApi.list({ search, page, limit }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => vendorsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] })
      toast.success('Vendor deleted successfully')
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to delete vendor')
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

  return (
    <div className="flex flex-1 flex-col overflow-hidden relative min-h-0">
      <Header
        title="Vendors"
        description="Manage your vendors and suppliers"
        icon={VendorsIcon}
        category="Directory"
        badgeText={data?.meta.total}
        action={
          canCreate ? (
            !isExpired ? (
              <Link to="/vendors/new">
                <Button>
                  <HugeiconsIcon icon={PlusSignIcon} size={16} className="mr-2" strokeWidth={1.5} />
                  Add Vendor
                </Button>
              </Link>
            ) : (
              <Button
                disabled
                className="opacity-50 cursor-not-allowed bg-slate-400 text-white rounded-xl h-10 px-4 select-none"
              >
                <HugeiconsIcon icon={PlusSignIcon} size={16} className="mr-2" strokeWidth={1.5} />
                Add Vendor
              </Button>
            )
          ) : undefined
        }
      />

      <div ref={scrollContainerRef} className="flex-1 overflow-auto px-4 pb-4 pt-0 sm:px-6 sm:pb-6 sm:pt-0">
        <div className="pt-4 sm:pt-6">
          {/* Search */}
          <div className="mb-6 flex items-center gap-4 sticky top-0 md:static z-20 bg-background py-3 -mx-4 px-4 md:-mx-0 md:px-0 md:bg-transparent md:py-0 md:mb-6 border-b border-[#eef4ff]/30 md:border-b-0">
            <div className="relative flex-1 max-w-sm">
              <HugeiconsIcon icon={Search01Icon} className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={1.5} />
              <Input
                placeholder="Search vendors..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                className="pl-11 rounded-xl h-10 bg-white border border-border"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : data?.data.length === 0 ? (
            <EmptyState
              icon={Store04Icon}
              title={search ? "No vendors found" : "No vendors recorded"}
              description={search ? "Try adjusting your search query." : "Keep a directory of your business vendors, contractors, and suppliers."}
              actionLabel={canCreate && !isExpired ? "Add your first vendor" : undefined}
              actionHref={canCreate && !isExpired ? "/vendors/new" : undefined}
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
                          <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-left text-[10px] font-extrabold uppercase tracking-widest text-slate-400 select-none">Vendor Name</th>
                          <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-left text-[10px] font-extrabold uppercase tracking-widest text-slate-400 select-none">Contact Person</th>
                          <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-left text-[10px] font-extrabold uppercase tracking-widest text-slate-400 select-none">Email</th>
                          <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-left text-[10px] font-extrabold uppercase tracking-widest text-slate-400 select-none">Phone</th>
                          <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-left text-[10px] font-extrabold uppercase tracking-widest text-slate-400 select-none">Payout Status</th>
                          <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-right text-[10px] font-extrabold uppercase tracking-widest text-slate-400 select-none">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y-0">
                        {data?.data.map((vendor, index) => (
                          <tr 
                            key={vendor.id} 
                            className={cn(
                              "transition-all duration-150 hover:bg-[#eef4ff]/20",
                              index % 2 === 0 ? "bg-transparent" : "bg-[#eef4ff]/08"
                            )}
                          >
                            <td className="px-6 py-4 font-semibold text-slate-900">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-[#0037b0]/5 text-[#0037b0] border border-[#0037b0]/8 shadow-[0_2px_6px_rgba(0,55,176,0.01)] flex items-center justify-center text-[11px] font-medium shrink-0 select-none">
                                  {getInitials(vendor.name)}
                                </div>
                                <Link to={`/vendors/${vendor.id}`} className="font-semibold text-slate-900 hover:text-[#0037b0] transition-colors truncate max-w-[200px] block text-sm">
                                  {vendor.name}
                                </Link>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-xs font-medium text-slate-500">
                              {vendor.contactPerson ? (
                                <span>{vendor.contactPerson}</span>
                              ) : (
                                <span className="text-slate-300">-</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-xs font-medium text-slate-500">
                              {vendor.email ? (
                                <span className="truncate max-w-[220px] block">
                                  {vendor.email}
                                </span>
                              ) : (
                                <span className="text-slate-300">-</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-xs font-medium text-slate-500">
                              {vendor.phone ? (
                                <span>{vendor.phone}</span>
                              ) : (
                                <span className="text-slate-300">-</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-left">
                              <div className="flex items-center gap-2 select-none justify-start">
                                <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", getPayoutStatusDisplay(vendor.paystackSubaccountStatus).dot)} />
                                <span className={cn("text-xs font-semibold tracking-wide", getPayoutStatusDisplay(vendor.paystackSubaccountStatus).text)}>
                                  {getPayoutStatusDisplay(vendor.paystackSubaccountStatus).label}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right relative">
                              <div className="inline-block text-left relative">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveDropdown(activeDropdown === vendor.id ? null : vendor.id);
                                  }}
                                  className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors cursor-pointer"
                                >
                                  <HugeiconsIcon icon={MoreVerticalIcon} size={16} strokeWidth={1.5} />
                                </button>
    
                                <DropdownPanel
                                  isOpen={activeDropdown === vendor.id}
                                  onClose={() => setActiveDropdown(null)}
                                  align="right"
                                  widthClass="w-36"
                                  zIndexClass="z-20"
                                >
                                  <Link
                                    to={`/vendors/${vendor.id}`}
                                    onClick={() => setActiveDropdown(null)}
                                    className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors rounded-lg"
                                  >
                                    <HugeiconsIcon icon={ViewIcon} size={14} className="text-slate-400" strokeWidth={1.5} />
                                    View Details
                                  </Link>
                                  {!isExpired && (
                                    <>
                                      <Link
                                        to={`/vendors/${vendor.id}/edit`}
                                        onClick={() => setActiveDropdown(null)}
                                        className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors rounded-lg"
                                      >
                                        <HugeiconsIcon icon={PencilEdit02Icon} size={14} className="text-slate-400" strokeWidth={1.5} />
                                        Edit Vendor
                                      </Link>
                                      {canCreate && (
                                        <button
                                          onClick={() => {
                                            setVendorToDelete({ id: vendor.id, name: vendor.name });
                                            setDeleteConfirmOpen(true);
                                            setActiveDropdown(null);
                                          }}
                                          className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer rounded-lg border-0"
                                        >
                                          <HugeiconsIcon icon={Delete02Icon} size={14} className="text-rose-500" strokeWidth={1.5} />
                                          Delete Vendor
                                        </button>
                                      )}
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
                {data?.data.map((vendor) => (
                  <div 
                    key={vendor.id}
                    onClick={() => navigate(`/vendors/${vendor.id}`)}
                    className="bg-white rounded-[24px] p-5 shadow-[0px_8px_24px_rgba(0,55,176,0.08)] border border-[#eef4ff]/50 transition-all duration-300 hover:shadow-[0px_12px_32px_rgba(0,55,176,0.12)] active:scale-[0.99] cursor-pointer relative flex flex-col gap-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-xl bg-[#0037b0]/5 text-[#0037b0] border border-[#0037b0]/8 flex items-center justify-center text-xs font-bold shrink-0 select-none">
                          {getInitials(vendor.name)}
                        </div>
                        <div className="min-w-0">
                          <span className="font-semibold text-slate-900 text-sm truncate block">
                            {vendor.name}
                          </span>
                          {vendor.serviceDescription && (
                            <span className="text-[10px] text-slate-400 font-medium line-clamp-1 block">
                              {vendor.serviceDescription}
                            </span>
                          )}
                        </div>
                      </div>

                      {!isExpired && (
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/vendors/${vendor.id}/edit`);
                            }}
                            className="w-11 h-11 rounded-full flex items-center justify-center bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer border border-[#eef4ff]/60 shrink-0"
                            aria-label="Edit Vendor"
                          >
                            <HugeiconsIcon icon={PencilEdit02Icon} size={16} strokeWidth={1.5} />
                          </button>
                          {canCreate && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setVendorToDelete({ id: vendor.id, name: vendor.name });
                                setDeleteConfirmOpen(true);
                              }}
                              className="w-11 h-11 rounded-full flex items-center justify-center bg-rose-50/50 text-rose-600 hover:bg-rose-100/50 hover:text-rose-700 transition-colors cursor-pointer border border-rose-500/10 shrink-0"
                              aria-label="Delete Vendor"
                            >
                              <HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={1.5} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      {vendor.contactPerson && (
                        <div className="flex items-center gap-2.5 text-xs font-medium text-slate-650 py-2 min-h-[44px]">
                          <span className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center shrink-0">
                            <HugeiconsIcon icon={UserIcon} size={14} className="text-slate-400" strokeWidth={1.5} />
                          </span>
                          <span className="truncate max-w-[220px]">{vendor.contactPerson}</span>
                        </div>
                      )}

                      {vendor.email ? (
                        <a 
                          href={`mailto:${vendor.email}`}
                          onClick={(e) => handleEmailClick(e, vendor.email!)}
                          className="flex items-center gap-2.5 text-xs font-medium text-slate-650 hover:text-[#0037b0] transition-colors py-2 min-h-[44px]"
                        >
                          <span className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center shrink-0">
                            <HugeiconsIcon icon={Mail01Icon} size={14} className="text-slate-400" strokeWidth={1.5} />
                          </span>
                          <span className="truncate max-w-[220px]">{vendor.email}</span>
                        </a>
                      ) : (
                        <div className="flex items-center gap-2.5 text-xs text-slate-350 italic py-2 min-h-[44px]">
                          <span className="w-8 h-8 rounded-full bg-slate-50/50 flex items-center justify-center shrink-0">
                            <HugeiconsIcon icon={Mail01Icon} size={14} className="text-slate-300" strokeWidth={1.5} />
                          </span>
                          <span>No email provided</span>
                        </div>
                      )}

                      {vendor.phone ? (
                        <a 
                          href={`tel:${vendor.phone}`}
                          onClick={(e) => handlePhoneClick(e, vendor.phone!)}
                          className="flex items-center gap-2.5 text-xs font-medium text-slate-650 hover:text-[#0037b0] transition-colors py-2 min-h-[44px]"
                        >
                          <span className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center shrink-0">
                            <HugeiconsIcon icon={Call02Icon} size={14} className="text-slate-400" strokeWidth={1.5} />
                          </span>
                          <span>{vendor.phone}</span>
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
                        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", getPayoutStatusDisplay(vendor.paystackSubaccountStatus).dot)} />
                        <span className={cn("text-xs font-semibold tracking-wide", getPayoutStatusDisplay(vendor.paystackSubaccountStatus).text)}>
                          {getPayoutStatusDisplay(vendor.paystackSubaccountStatus).label}
                        </span>
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
                Load More Vendors ({data.meta.total - limit} remaining)
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Floating Action Button */}
      {canCreate && !isExpired && (
        <Link 
          to="/vendors/new" 
          className="absolute bottom-6 right-6 z-40 sm:hidden w-14 h-14 rounded-full bg-gradient-to-br from-[#0037b0] to-[#1d4ed8] text-white flex items-center justify-center shadow-[0px_8px_24px_rgba(0,55,176,0.25)] hover:scale-105 active:scale-95 transition-all animate-rubber-bottom"
          aria-label="Add Vendor"
        >
          <HugeiconsIcon icon={PlusSignIcon} size={24} strokeWidth={1.5} />
        </Link>
      )}

      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        onClose={() => {
          setDeleteConfirmOpen(false)
          setVendorToDelete(null)
        }}
        onConfirm={() => {
          if (vendorToDelete) {
            deleteMutation.mutate(vendorToDelete.id, {
              onSuccess: () => {
                setDeleteConfirmOpen(false)
                setVendorToDelete(null)
              }
            })
          }
        }}
        title="Delete Vendor"
        description={`Are you sure you want to delete the vendor "${vendorToDelete?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous={true}
        isLoading={deleteMutation.isPending}
      />
    </div>
  )
}
