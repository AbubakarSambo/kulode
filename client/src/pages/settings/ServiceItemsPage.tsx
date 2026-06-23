import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  PlusSignIcon,
  Search01Icon,
  PencilEdit02Icon,
  Delete02Icon,
  Grid02Icon,
  ArrowDown01Icon,
  MoreVerticalIcon
} from '@hugeicons/core-free-icons'
import { Header } from '@/components/layout'
import { Button, Input, Label, Textarea, Card, CardContent, ConfirmDialog, EmptyState, DropdownPanel } from '@/components/ui'
import { Modal } from '@/components/shared/Modal'
import { invoicesApi } from '@/api'
import { formatCurrency, cn } from '@/lib/utils'
import { posthog } from '@/lib/posthog'
import type { ServiceItem } from '@/types'
import { useOverscrollBounce } from '@/hooks'
import { ServicesIcon } from '@/components/ui/CustomIcons'
import { useSubscription } from '@/hooks/useSubscription'

const serviceItemSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  unitPrice: z.number().min(0, 'Price must be 0 or greater'),
})

type ServiceItemFormData = z.infer<typeof serviceItemSchema>

const getInitials = (name: string) => {
  if (!name) return '??'
  const cleanName = name.replace(/[^a-zA-Z0-9\s]/g, '').trim()
  const parts = cleanName.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '??'
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

export function ServiceItemsPage() {
  const { isReadOnlyMode: isExpired } = useSubscription()
  const scrollContainerRef = useOverscrollBounce<HTMLDivElement>()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<ServiceItem | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<ServiceItem | null>(null)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [limitOpen, setLimitOpen] = useState(false)
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null)

  const { data: serviceItems, isLoading } = useQuery({
    queryKey: ['service-items'],
    queryFn: () => invoicesApi.listServiceItems(),
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ServiceItemFormData>({
    resolver: zodResolver(serviceItemSchema),
    defaultValues: {
      name: '',
      description: '',
      unitPrice: 0,
    },
  })

  const createMutation = useMutation({
    mutationFn: (data: ServiceItemFormData) => invoicesApi.createServiceItem(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-items'] })
      posthog.capture('service_item_created')
      toast.success('Service item created successfully')
      closeModal()
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (error: any) => {
      toast.error('Failed to create service item', {
        description: error.response?.data?.message,
      })
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: ServiceItemFormData) => invoicesApi.updateServiceItem(editingItem!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-items'] })
      posthog.capture('service_item_updated')
      toast.success('Service item updated successfully')
      closeModal()
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (error: any) => {
      toast.error('Failed to update service item', {
        description: error.response?.data?.message,
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => invoicesApi.deleteServiceItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-items'] })
      posthog.capture('service_item_deleted')
      toast.success('Service item deleted successfully')
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (error: any) => {
      toast.error('Failed to delete service item', {
        description: error.response?.data?.message,
      })
    },
  })

  const openCreateModal = () => {
    setEditingItem(null)
    reset({ name: '', description: '', unitPrice: 0 })
    setIsModalOpen(true)
  }

  const openEditModal = (item: ServiceItem) => {
    setEditingItem(item)
    reset({ name: item.name, description: item.description || '', unitPrice: item.unitPrice })
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingItem(null)
    reset({ name: '', description: '', unitPrice: 0 })
  }

  const onSubmit = (data: ServiceItemFormData) => {
    if (editingItem) {
      updateMutation.mutate(data)
    } else {
      createMutation.mutate(data)
    }
  }

  const handleDeleteTrigger = (item: ServiceItem) => {
    setItemToDelete(item)
    setDeleteConfirmOpen(true)
  }

  const filteredItems = (serviceItems ?? []).filter((item) => 
    item.name.toLowerCase().includes(search.toLowerCase()) ||
    (item.description && item.description.toLowerCase().includes(search.toLowerCase()))
  )

  const paginatedItems = filteredItems.slice((page - 1) * limit, page * limit)
  const totalPages = Math.ceil(filteredItems.length / limit)

  return (
    <div className="flex flex-1 flex-col overflow-hidden relative min-h-0">
      <Header
        title="Service Items"
        description="Manage predefined services and products for invoices"
        icon={ServicesIcon}
        category="Settings"
        badgeText={serviceItems?.length}
        action={
          isExpired ? (
            <Button
              disabled
              className="opacity-50 cursor-not-allowed bg-slate-400 text-white rounded-xl h-10 px-4 select-none"
            >
              <HugeiconsIcon icon={PlusSignIcon} className="mr-2 h-4 w-4" strokeWidth={1.5} />
              Add Service Item
            </Button>
          ) : (
            <Button onClick={openCreateModal}>
              <HugeiconsIcon icon={PlusSignIcon} className="mr-2 h-4 w-4" strokeWidth={1.5} />
              Add Service Item
            </Button>
          )
        }
      />

      <div ref={scrollContainerRef} className="flex-1 overflow-auto px-4 pb-4 pt-0 sm:p-6">
        {/* Search */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between stagger-in sticky top-0 md:static z-20 bg-background py-3 -mx-4 px-4 md:-mx-0 md:px-0 md:bg-transparent md:py-0 md:mb-6 border-b border-[#eef4ff]/30 md:border-b-0">
          <div className="relative flex-1 max-w-sm">
            <HugeiconsIcon icon={Search01Icon} className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={1.5} />
            <Input
              placeholder="Search service items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-11 rounded-xl h-10 bg-white border border-border"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : paginatedItems.length > 0 ? (
          <>
            {/* Desktop Table View */}
            <Card className="hidden md:block border-0 bg-white shadow-[0px_12px_32px_rgba(0,55,176,0.08)] rounded-[24px] overflow-visible">
              <CardContent className="p-0">
                <div className="overflow-visible">
                  <table className="w-full min-w-[700px] border-collapse">
                    <thead>
                      <tr className="bg-white text-slate-650">
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-left text-[10px] font-extrabold uppercase tracking-widest text-slate-400 select-none">Service Name</th>
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-left text-[10px] font-extrabold uppercase tracking-widest text-slate-400 select-none">Description</th>
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-left text-[10px] font-extrabold uppercase tracking-widest text-slate-400 select-none">Unit Price</th>
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-right text-[10px] font-extrabold uppercase tracking-widest text-slate-400 select-none">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y-0">
                      {paginatedItems.map((item, index) => (
                        <tr 
                          key={item.id} 
                          className={cn(
                            "transition-all duration-150 hover:bg-[#eef4ff]/20",
                            index % 2 === 0 ? "bg-transparent" : "bg-[#eef4ff]/08"
                          )}
                        >
                          <td className="px-6 py-4 font-semibold text-slate-900">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-[#0037b0]/5 text-[#0037b0] border border-[#0037b0]/8 shadow-[0_2px_6px_rgba(0,55,176,0.01)] flex items-center justify-center text-[11px] font-medium shrink-0 select-none">
                                {getInitials(item.name)}
                              </div>
                              <span className="font-semibold text-slate-900 truncate max-w-[200px] block text-sm">
                                {item.name}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-xs font-medium text-slate-500">
                            {item.description ? (
                              <span className="truncate max-w-[320px] block">
                                {item.description}
                              </span>
                            ) : (
                              <span className="text-slate-350 italic">No description</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm font-extrabold text-[#0037b0] tabular-nums">
                            {formatCurrency(item.unitPrice)}
                          </td>
                          <td className="px-6 py-4 text-right relative">
                            {!isExpired && (
                              <div className="inline-block text-left relative">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveDropdown(activeDropdown === item.id ? null : item.id);
                                  }}
                                  className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors cursor-pointer"
                                >
                                  <HugeiconsIcon icon={MoreVerticalIcon} size={16} strokeWidth={1.5} />
                                </button>
    
                                <DropdownPanel
                                  isOpen={activeDropdown === item.id}
                                  onClose={() => setActiveDropdown(null)}
                                  align="right"
                                  widthClass="w-36"
                                  zIndexClass="z-20"
                                >
                                  <button
                                    onClick={() => {
                                      openEditModal(item);
                                      setActiveDropdown(null);
                                    }}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors rounded-lg border-0"
                                  >
                                    <HugeiconsIcon icon={PencilEdit02Icon} size={14} className="text-slate-400" strokeWidth={1.5} />
                                    Edit Item
                                  </button>
                                  <button
                                    onClick={() => {
                                      handleDeleteTrigger(item);
                                      setActiveDropdown(null);
                                    }}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer rounded-lg border-0"
                                  >
                                    <HugeiconsIcon icon={Delete02Icon} size={14} className="text-rose-500" strokeWidth={1.5} />
                                    Delete Item
                                  </button>
                                </DropdownPanel>
                              </div>
                            )}
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
              {paginatedItems.map((item) => (
                <div 
                  key={item.id}
                  onClick={isExpired ? undefined : () => openEditModal(item)}
                  className={cn(
                    "bg-white rounded-[24px] p-5 shadow-[0px_8px_24px_rgba(0,55,176,0.08)] border border-[#eef4ff]/50 transition-all duration-300 flex flex-col gap-4",
                    !isExpired && "hover:shadow-[0px_12px_32px_rgba(0,55,176,0.12)] active:scale-[0.99] cursor-pointer"
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-xl bg-[#0037b0]/5 text-[#0037b0] border border-[#0037b0]/8 flex items-center justify-center text-xs font-bold shrink-0 select-none">
                        {getInitials(item.name)}
                      </div>
                      <div className="min-w-0">
                        <span className="font-semibold text-slate-900 text-sm truncate block">
                          {item.name}
                        </span>
                      </div>
                    </div>

                    {!isExpired && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditModal(item);
                          }}
                          className="w-11 h-11 rounded-full flex items-center justify-center bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer border border-[#eef4ff]/60 shrink-0"
                          aria-label="Edit Item"
                        >
                          <HugeiconsIcon icon={PencilEdit02Icon} size={16} strokeWidth={1.5} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTrigger(item);
                          }}
                          className="w-11 h-11 rounded-full flex items-center justify-center bg-rose-50/50 text-rose-600 hover:bg-rose-100/50 hover:text-rose-700 transition-colors cursor-pointer border border-rose-500/10 shrink-0"
                          aria-label="Delete Item"
                        >
                          <HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={1.5} />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="text-base font-extrabold text-[#0037b0] tabular-nums">
                    {formatCurrency(item.unitPrice)}
                  </div>

                  {item.description && (
                    <p className="text-xs text-slate-500 font-semibold leading-relaxed line-clamp-3">
                      {item.description}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* Pagination & Limit Selector */}
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
              
              {totalPages >= 1 && (
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
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === totalPages}
                    onClick={() => setPage(page + 1)}
                    className="h-8 rounded-lg text-xs"
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>

            {/* Mobile Load More Button */}
            {filteredItems.length > limit && (
              <div className="mt-6 md:hidden flex justify-center">
                <Button
                  onClick={() => setLimit((prev) => prev + 10)}
                  variant="outline"
                  className="w-full py-4 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-all min-h-[44px]"
                >
                  Load More Items ({filteredItems.length - limit} remaining)
                </Button>
              </div>
            )}
          </>
        ) : (
          <EmptyState
            icon={Grid02Icon}
            title={search ? "No service items found" : "No services defined"}
            description={search ? "Try adjusting your search terms." : "Define predefined services or products to add them to invoices in a single click."}
            actionLabel={isExpired ? undefined : "Add your first service item"}
            onAction={isExpired ? undefined : openCreateModal}
          />
        )}
      </div>

      {/* Mobile Floating Action Button */}
      {!isExpired && (
        <Button 
          onClick={openCreateModal}
          className="absolute bottom-6 right-6 z-40 sm:hidden w-14 h-14 rounded-full bg-gradient-to-br from-[#0037b0] to-[#1d4ed8] text-white flex items-center justify-center shadow-[0px_8px_24px_rgba(0,55,176,0.25)] hover:scale-105 active:scale-95 transition-all p-0"
          aria-label="Add Service Item"
        >
          <HugeiconsIcon icon={PlusSignIcon} size={24} strokeWidth={1.5} />
        </Button>
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingItem ? 'Edit Service Item' : 'New Service Item'}
        description={editingItem ? 'Update the service item details' : 'Create a new service or product'}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name" required>Name</Label>
            <Input
              id="name"
              placeholder="e.g., Web Design"
              {...register('name')}
              error={errors.name?.message}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="unitPrice" required>Unit Price</Label>
            <Input
              id="unitPrice"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              {...register('unitPrice', { valueAsNumber: true })}
              error={errors.unitPrice?.message}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Optional description..."
              {...register('description')}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="submit"
              isLoading={createMutation.isPending || updateMutation.isPending}
            >
              {editingItem ? 'Save Changes' : 'Create Service Item'}
            </Button>
            <Button type="button" variant="outline" onClick={closeModal}>
              Cancel
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        onClose={() => {
          setDeleteConfirmOpen(false)
          setItemToDelete(null)
        }}
        onConfirm={() => {
          if (itemToDelete) {
            deleteMutation.mutate(itemToDelete.id, {
              onSuccess: () => {
                setDeleteConfirmOpen(false)
                setItemToDelete(null)
              }
            })
          }
        }}
        title="Delete Service Item"
        description={`Are you sure you want to delete the service item "${itemToDelete?.name}"? This action cannot be undone and will permanently remove this predefined item, though existing invoices will remain unaffected.`}
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous={true}
        isLoading={deleteMutation.isPending}
      />
    </div>
  )
}
