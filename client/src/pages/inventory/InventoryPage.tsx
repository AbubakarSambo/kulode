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
  PackageIcon,
  TradeUpIcon,
  TradeDownIcon,
  ArrowDown01Icon,
  FilterHorizontalIcon,
  MoreVerticalIcon
} from '@hugeicons/core-free-icons'
import { Header } from '@/components/layout'
import { Button, Input, Label, Textarea, Card, CardContent, Badge, ConfirmDialog, EmptyState, DropdownPanel } from '@/components/ui'
import { Modal } from '@/components/shared/Modal'
import { BottomSheet } from '@/components/shared'
import { inventoryApi } from '@/api/inventory'
import { useSubscription } from '@/hooks/useSubscription'

import { formatCurrency, cn } from '@/lib/utils'
import type { InventoryItem, StockMovement, StockMovementType } from '@/types'
import { InventoryIcon } from '@/components/ui/CustomIcons'
import { useOverscrollBounce } from '@/hooks'
import { posthog } from '@/lib/posthog'

// ─── Schemas ────────────────────────────────────────────────────────────────

const inventoryItemSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  unitPrice: z.number().min(0, 'Price must be 0 or greater'),
  initialStock: z.number().min(0).optional(),
  reorderLevel: z.number().min(0).optional(),
  sku: z.string().optional(),
})

const updateItemSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  unitPrice: z.number().min(0, 'Price must be 0 or greater'),
  reorderLevel: z.number().min(0).optional(),
  sku: z.string().optional(),
})

const adjustStockSchema = z.object({
  type: z.enum(['RESTOCK', 'ADJUSTMENT']),
  quantity: z.number().min(0.01, 'Quantity must be greater than 0'),
  notes: z.string().optional(),
})

type InventoryItemFormData = z.infer<typeof inventoryItemSchema>
type UpdateItemFormData = z.infer<typeof updateItemSchema>
type AdjustStockFormData = z.infer<typeof adjustStockSchema>

// ─── Helpers ────────────────────────────────────────────────────────────────

function movementLabel(type: StockMovementType): string {
  switch (type) {
    case 'RESTOCK': return 'Restock'
    case 'ADJUSTMENT': return 'Write-off'
    case 'INVOICE_RESERVED': return 'Reserved'
    case 'INVOICE_DEDUCTED': return 'Deducted'
    case 'RESERVATION_RELEASED': return 'Released'
  }
}

function movementColor(type: StockMovementType): string {
  switch (type) {
    case 'RESTOCK': return 'text-emerald-600'
    case 'ADJUSTMENT': return 'text-rose-500'
    case 'INVOICE_RESERVED': return 'text-amber-500'
    case 'INVOICE_DEDUCTED': return 'text-rose-500'
    case 'RESERVATION_RELEASED': return 'text-[#0037b0]'
  }
}

const getInitials = (name: string) => {
  if (!name) return '??'
  const cleanName = name.replace(/[^a-zA-Z0-9\s]/g, '').trim()
  const parts = cleanName.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '??'
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

// ─── Components ─────────────────────────────────────────────────────────────

export function InventoryPage() {
  const scrollContainerRef = useOverscrollBounce<HTMLDivElement>()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [stockFilter, setStockFilter] = useState<'all' | 'low'>('all')
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false)
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false)
  const [tempStockFilter, setTempStockFilter] = useState<'all' | 'low'>('all')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [limitOpen, setLimitOpen] = useState(false)
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null)
  const { isReadOnlyMode: isExpired } = useSubscription()


  const openMobileFilters = () => {
    setTempStockFilter(stockFilter)
    setIsMobileFiltersOpen(true)
  }

  const closeMobileFilters = () => {
    setIsMobileFiltersOpen(false)
  }

  // Modal state
  const [createOpen, setCreateOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const [adjustingItem, setAdjustingItem] = useState<InventoryItem | null>(null)
  const [movementsItem, setMovementsItem] = useState<InventoryItem | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<InventoryItem | null>(null)

  // ─── Queries ────────────────────────────────────────────────────────────

  const { data: items, isLoading } = useQuery({
    queryKey: ['inventory-items'],
    queryFn: () => inventoryApi.list(),
  })

  const { data: movements, isLoading: movementsLoading } = useQuery({
    queryKey: ['inventory-movements', movementsItem?.id],
    queryFn: () => inventoryApi.getMovements(movementsItem!.id),
    enabled: !!movementsItem,
  })

  // ─── Create form ────────────────────────────────────────────────────────

  const createForm = useForm<InventoryItemFormData>({
    resolver: zodResolver(inventoryItemSchema),
    defaultValues: { name: '', description: '', unitPrice: 0, initialStock: 0, reorderLevel: 0, sku: '' },
  })

  const createMutation = useMutation({
    mutationFn: (data: InventoryItemFormData) => inventoryApi.create({
      name: data.name,
      description: data.description || undefined,
      unitPrice: data.unitPrice,
      initialStock: data.initialStock || undefined,
      reorderLevel: data.reorderLevel || undefined,
      sku: data.sku || undefined,
    }),
    onSuccess: () => {
      posthog.capture('inventory_item_created')
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] })
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] })
      toast.success('Inventory item created successfully')
      setCreateOpen(false)
      createForm.reset()
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (error: any) => {
      toast.error('Failed to create inventory item', { description: error.response?.data?.message })
    },
  })

  // ─── Edit form ──────────────────────────────────────────────────────────

  const editForm = useForm<UpdateItemFormData>({
    resolver: zodResolver(updateItemSchema),
  })

  const updateMutation = useMutation({
    mutationFn: (data: UpdateItemFormData) => inventoryApi.update(editingItem!.id, {
      name: data.name,
      description: data.description || undefined,
      unitPrice: data.unitPrice,
      reorderLevel: data.reorderLevel || undefined,
      sku: data.sku || undefined,
    }),
    onSuccess: () => {
      posthog.capture('inventory_item_updated')
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] })
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] })
      toast.success('Inventory item updated successfully')
      setEditingItem(null)
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (error: any) => {
      toast.error('Failed to update inventory item', { description: error.response?.data?.message })
    },
  })

  const openEdit = (item: InventoryItem) => {
    setEditingItem(item)
    editForm.reset({
      name: item.name,
      description: item.description || '',
      unitPrice: item.unitPrice,
      reorderLevel: item.reorderLevel,
      sku: item.sku || '',
    })
  }

  // ─── Delete ─────────────────────────────────────────────────────────────

  const deleteMutation = useMutation({
    mutationFn: (id: string) => inventoryApi.delete(id),
    onSuccess: () => {
      posthog.capture('inventory_item_deleted')
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] })
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] })
      toast.success('Inventory item deleted successfully')
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (error: any) => {
      toast.error('Cannot delete inventory item', { description: error.response?.data?.message })
    },
  })

  const handleDeleteTrigger = (item: InventoryItem) => {
    setItemToDelete(item)
    setDeleteConfirmOpen(true)
  }

  // ─── Adjust stock form ──────────────────────────────────────────────────

  const adjustForm = useForm<AdjustStockFormData>({
    resolver: zodResolver(adjustStockSchema),
    defaultValues: { type: 'RESTOCK', quantity: 1, notes: '' },
  })

  const adjustMutation = useMutation({
    mutationFn: (data: AdjustStockFormData) => inventoryApi.adjustStock(adjustingItem!.id, {
      type: data.type,
      quantity: data.quantity,
      notes: data.notes || undefined,
    }),
    onSuccess: (_, variables) => {
      posthog.capture('inventory_stock_adjusted', { type: variables.type })
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] })
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] })
      toast.success('Stock adjusted successfully')
      setAdjustingItem(null)
      adjustForm.reset({ type: 'RESTOCK', quantity: 1, notes: '' })
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (error: any) => {
      toast.error('Failed to adjust stock', { description: error.response?.data?.message })
    },
  })

  const openAdjust = (item: InventoryItem) => {
    setAdjustingItem(item)
    adjustForm.reset({ type: 'RESTOCK', quantity: 1, notes: '' })
  }

  // Local filtering & search
  const filteredItems = (items ?? []).filter((item) => {
    const matchesSearch = 
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      (item.sku && item.sku.toLowerCase().includes(search.toLowerCase())) ||
      (item.description && item.description.toLowerCase().includes(search.toLowerCase()))
    
    const isLowStock = item.availableQuantity <= item.reorderLevel
    const matchesFilter = stockFilter === 'all' || (stockFilter === 'low' && isLowStock)
    
    return matchesSearch && matchesFilter
  })

  const paginatedItems = filteredItems.slice((page - 1) * limit, page * limit)
  const totalPages = Math.ceil(filteredItems.length / limit)

  return (
    <div className="flex flex-1 flex-col overflow-hidden relative min-h-0">
      <Header
        title="Product Inventory"
        description="Track physical goods and stock levels"
        icon={InventoryIcon}
        category="Business Ops"
        badgeText={items?.length}
        action={
          isExpired ? (
            <Button
              disabled
              className="opacity-50 cursor-not-allowed bg-slate-400 text-white rounded-xl h-10 px-4 select-none"
            >
              <HugeiconsIcon icon={PlusSignIcon} className="mr-2 h-4 w-4" strokeWidth={1.5} />
              Add Item
            </Button>
          ) : (
            <Button onClick={() => setCreateOpen(true)}>
              <HugeiconsIcon icon={PlusSignIcon} className="mr-2 h-4 w-4" strokeWidth={1.5} />
              Add Item
            </Button>
          )
        }
      />

      <div ref={scrollContainerRef} className="flex-1 overflow-auto px-4 pb-4 pt-0 sm:p-6">
        {/* Filters and Search */}
        <div className="mb-6 flex flex-col gap-4 stagger-in sticky top-0 md:static z-20 bg-background py-3 -mx-4 px-4 md:-mx-0 md:px-0 md:bg-transparent md:py-0 md:mb-6 border-b border-[#eef4ff]/30 md:border-b-0">
          {/* Desktop Filters (hidden on mobile) */}
          <div className="hidden md:flex flex-row items-center gap-4 justify-between w-full">
            <div className="flex items-center gap-3 flex-1">
              <div className="relative flex-1 max-w-[240px]">
                <HugeiconsIcon icon={Search01Icon} className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={1.5} />
                <Input
                  placeholder="Search inventory..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-11 rounded-xl h-10 bg-white border border-border"
                />
              </div>

              {/* Stock Filter Dropdown */}
              <div className="relative inline-block text-left">
                <button
                  type="button"
                  onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
                  className={cn(
                    "h-10 px-4 rounded-xl border bg-white text-xs font-semibold hover:bg-slate-50 transition-all flex items-center justify-between gap-2 min-w-[140px] cursor-pointer",
                    stockFilter !== 'all' ? "border-[#0037b0]/35 text-[#0037b0] bg-[#0037b0]/04" : "border-border text-slate-700"
                  )}
                >
                  <span className="truncate">
                    {stockFilter === 'low' ? 'Low Stock' : 'All Items'}
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
                    { label: 'All Items', value: 'all' },
                    { label: 'Low Stock', value: 'low' },
                  ] as const).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setStockFilter(opt.value)
                        setStatusDropdownOpen(false)
                      }}
                      className={cn(
                        "w-full text-left px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors block cursor-pointer",
                        stockFilter === opt.value 
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
                placeholder="Search inventory..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-11 rounded-xl h-11 bg-white w-full border-border focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
              />
            </div>

            <button
              type="button"
              onClick={openMobileFilters}
              className={cn(
                "h-11 w-11 rounded-xl border flex items-center justify-center relative hover:bg-slate-50 transition-all shrink-0 cursor-pointer",
                stockFilter !== 'all' 
                  ? "border-[#0037b0] text-[#0037b0] bg-[#0037b0]/04" 
                  : "border-border bg-white text-slate-750"
              )}
              aria-label="Filters"
            >
              <HugeiconsIcon icon={FilterHorizontalIcon} className="h-5 w-5" strokeWidth={1.5} />
              {stockFilter !== 'all' && (
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
        ) : paginatedItems.length > 0 ? (
          <>
            {/* Desktop Table View */}
            <Card className="hidden md:block border-0 bg-white shadow-[0px_12px_32px_rgba(0,55,176,0.08)] rounded-[24px] overflow-visible">
              <CardContent className="p-0">
                <div className="overflow-visible">
                  <table className="w-full min-w-[700px] border-collapse">
                    <thead>
                      <tr className="bg-white text-slate-650">
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-left text-[10px] font-extrabold uppercase tracking-widest text-slate-400 select-none">Item Name</th>
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-left text-[10px] font-extrabold uppercase tracking-widest text-slate-400 select-none">SKU</th>
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-left text-[10px] font-extrabold uppercase tracking-widest text-slate-400 select-none">Unit Price</th>
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-center text-[10px] font-extrabold uppercase tracking-widest text-slate-400 select-none">Stock Levels (On Hand / Reserved / Available)</th>
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-left text-[10px] font-extrabold uppercase tracking-widest text-slate-400 select-none">Status</th>
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-right text-[10px] font-extrabold uppercase tracking-widest text-slate-400 select-none">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y-0">
                      {paginatedItems.map((item, index) => {
                        const isLowStock = item.availableQuantity <= item.reorderLevel;
                        return (
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
                              {item.sku ? (
                                <span className="uppercase tracking-wider font-bold text-slate-400">{item.sku}</span>
                              ) : (
                                <span className="text-slate-300">-</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-sm font-extrabold text-[#0037b0] tabular-nums">
                              {formatCurrency(item.unitPrice)}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center justify-center gap-4 text-xs">
                                <div className="text-center">
                                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">On Hand</p>
                                  <p className="font-bold text-slate-800 mt-0.5">{item.onHandQuantity}</p>
                                </div>
                                <div className="text-center">
                                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Reserved</p>
                                  <p className="font-bold text-amber-600 mt-0.5">{item.reservedQuantity}</p>
                                </div>
                                <div className="text-center">
                                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Available</p>
                                  <p className={cn(
                                    "font-extrabold mt-0.5",
                                    item.availableQuantity <= 0 ? 'text-[#ba1a1a]' : 'text-emerald-700'
                                  )}>
                                    {item.availableQuantity}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-left">
                              {isLowStock ? (
                                <Badge variant="outline" className="border-rose-200 bg-rose-50/50 text-rose-600 py-0.5 px-2 rounded-md font-bold uppercase tracking-wide text-[8px] shadow-sm select-none">
                                  Low Stock
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="border-emerald-200 bg-emerald-50/50 text-emerald-600 py-0.5 px-2 rounded-md font-bold uppercase tracking-wide text-[8px] shadow-sm select-none">
                                  In Stock
                                </Badge>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right relative">
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
                                  widthClass="w-40"
                                  zIndexClass="z-20"
                                >
                                  {!isExpired && (
                                    <>
                                      <button
                                        onClick={() => {
                                          openAdjust(item);
                                          setActiveDropdown(null);
                                        }}
                                        className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors rounded-lg border-0 cursor-pointer"
                                      >
                                        <HugeiconsIcon icon={PackageIcon} size={14} className="text-slate-400" strokeWidth={1.5} />
                                        Adjust Stock
                                      </button>
                                      <button
                                        onClick={() => {
                                          openEdit(item);
                                          setActiveDropdown(null);
                                        }}
                                        className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors rounded-lg border-0 cursor-pointer"
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
                                    </>
                                  )}
                                </DropdownPanel>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Mobile Card-Based List View */}
            <div className="flex flex-col gap-4 md:hidden">
              {paginatedItems.map((item) => {
                const isLowStock = item.availableQuantity <= item.reorderLevel;
                return (
                  <div 
                    key={item.id}
                    onClick={() => setMovementsItem(item)}
                    className="bg-white rounded-[24px] p-5 shadow-[0px_8px_24px_rgba(0,55,176,0.08)] border border-[#eef4ff]/50 transition-all duration-300 hover:shadow-[0px_12px_32px_rgba(0,55,176,0.12)] active:scale-[0.99] cursor-pointer relative flex flex-col gap-4"
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
                          {item.sku && (
                            <span className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wider block">SKU: {item.sku}</span>
                          )}
                        </div>
                      </div>

                      {!isExpired && (
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openEdit(item);
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
                      <p className="text-xs text-slate-500 font-semibold leading-relaxed line-clamp-2">
                        {item.description}
                      </p>
                    )}

                    {/* Stock levels grid */}
                    <div className="grid grid-cols-3 gap-1 rounded-2xl bg-[#eef4ff]/35 border border-[#eef4ff]/50 p-3 text-center text-xs">
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">On Hand</p>
                        <p className="font-bold text-slate-800 mt-0.5">{item.onHandQuantity}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Reserved</p>
                        <p className="font-bold text-amber-600 mt-0.5">{item.reservedQuantity}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Available</p>
                        <p className={cn(
                          "font-extrabold mt-0.5",
                          item.availableQuantity <= 0 ? 'text-[#ba1a1a]' : 'text-emerald-700'
                        )}>
                          {item.availableQuantity}
                        </p>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between mt-1 pt-3 border-t border-[#eef4ff]/50">
                      <div className="flex items-center gap-1.5 select-none">
                        <span className={cn(
                          "h-1.5 w-1.5 rounded-full shrink-0",
                          isLowStock ? "bg-rose-500" : "bg-emerald-500"
                        )} />
                        <span className={cn(
                          "text-xs font-semibold tracking-wide",
                          isLowStock ? "text-rose-700" : "text-emerald-700"
                        )}>
                          {isLowStock ? 'Low Stock' : 'In Stock'}
                        </span>
                      </div>
                      
                      <div className="flex gap-2">
                        {!isExpired && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-9 rounded-xl text-xs font-semibold border-slate-200/80"
                            onClick={(e) => {
                              e.stopPropagation();
                              openAdjust(item);
                            }}
                          >
                            <HugeiconsIcon icon={PackageIcon} className="mr-1 h-3.5 w-3.5 text-slate-400" strokeWidth={1.5} />
                            Adjust
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
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
            icon={PackageIcon}
            title={search ? "No product inventory items found" : "No product inventory items"}
            description={search ? "Try adjusting your search terms." : "Add physical goods to track stock levels, issue alerts, and manage invoice reservations."}
            actionLabel={isExpired ? undefined : "Add your first item"}
            onAction={isExpired ? undefined : () => setCreateOpen(true)}
          />
        )}
      </div>

      {/* Mobile Floating Action Button */}
      {!isExpired && (
        <Button 
          onClick={() => setCreateOpen(true)}
          className="absolute bottom-6 right-6 z-40 sm:hidden w-14 h-14 rounded-full bg-gradient-to-br from-[#0037b0] to-[#1d4ed8] text-white flex items-center justify-center shadow-[0px_8px_24px_rgba(0,55,176,0.25)] hover:scale-105 active:scale-95 transition-all p-0"
          aria-label="Add Item"
        >
          <HugeiconsIcon icon={PlusSignIcon} size={24} strokeWidth={1.5} />
        </Button>
      )}

      {/* Mobile slide-up bottom sheet for filters */}
      <BottomSheet
        isOpen={isMobileFiltersOpen}
        onClose={closeMobileFilters}
        title="Filter Stock"
        onClearAll={() => setTempStockFilter('all')}
      >
        {/* Scrollable Filters list */}
        <div className="flex-1 overflow-y-auto space-y-4 pb-6 select-none text-left">
          {/* Stock Section */}
          <div className="bg-[#eef4ff]/35 rounded-2xl p-4">
            <h4 className="text-[10px] font-extrabold uppercase tracking-widest text-[#0037b0]/60 mb-3">Stock Level</h4>
            <div className="grid grid-cols-2 gap-2">
              {([
                { label: 'All Items', value: 'all' },
                { label: 'Low Stock', value: 'low' }
              ] as const).map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setTempStockFilter(opt.value)}
                  className={cn(
                    "py-2 px-3 rounded-full text-xs font-semibold transition-all text-center cursor-pointer border-0",
                    tempStockFilter === opt.value
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
              setStockFilter(tempStockFilter)
              closeMobileFilters()
            }}
            className="py-3 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-[#0037b0] to-[#1d4ed8] hover:opacity-95 transition-all min-h-[44px] border-0"
          >
            Apply Filters
          </Button>
        </div>
      </BottomSheet>

      {/* ── Create Modal ── */}
      <Modal
        isOpen={createOpen}
        onClose={() => { setCreateOpen(false); createForm.reset() }}
        title="New Inventory Item"
        description="Add a physical product to track stock"
      >
        <form onSubmit={createForm.handleSubmit((d) => createMutation.mutate(d))} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="create-name" required>Name</Label>
            <Input
              id="create-name"
              placeholder="e.g., Chocolate Cake (6-inch)"
              {...createForm.register('name')}
              error={createForm.formState.errors.name?.message}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="create-price" required>Unit Price</Label>
              <Input
                id="create-price"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                {...createForm.register('unitPrice', { valueAsNumber: true })}
                error={createForm.formState.errors.unitPrice?.message}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-sku">SKU</Label>
              <Input
                id="create-sku"
                placeholder="Optional"
                {...createForm.register('sku')}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="create-initial">Initial Stock</Label>
              <Input
                id="create-initial"
                type="number"
                step="0.01"
                min="0"
                placeholder="0"
                {...createForm.register('initialStock', { valueAsNumber: true })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-reorder">Reorder Level</Label>
              <Input
                id="create-reorder"
                type="number"
                step="0.01"
                min="0"
                placeholder="0"
                {...createForm.register('reorderLevel', { valueAsNumber: true })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="create-desc">Description</Label>
            <Textarea
              id="create-desc"
              placeholder="Optional description..."
              {...createForm.register('description')}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" isLoading={createMutation.isPending}>
              Create Item
            </Button>
            <Button type="button" variant="outline" onClick={() => { setCreateOpen(false); createForm.reset() }}>
              Cancel
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── Edit Modal ── */}
      <Modal
        isOpen={!!editingItem}
        onClose={() => setEditingItem(null)}
        title="Edit Inventory Item"
        description="Update item details (stock changes use Adjust Stock)"
      >
        <form onSubmit={editForm.handleSubmit((d) => updateMutation.mutate(d))} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name" required>Name</Label>
            <Input
              id="edit-name"
              {...editForm.register('name')}
              error={editForm.formState.errors.name?.message}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-price" required>Unit Price</Label>
              <Input
                id="edit-price"
                type="number"
                step="0.01"
                min="0"
                {...editForm.register('unitPrice', { valueAsNumber: true })}
                error={editForm.formState.errors.unitPrice?.message}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-sku">SKU</Label>
              <Input id="edit-sku" {...editForm.register('sku')} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-reorder">Reorder Level</Label>
            <Input
              id="edit-reorder"
              type="number"
              step="0.01"
              min="0"
              {...editForm.register('reorderLevel', { valueAsNumber: true })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-desc">Description</Label>
            <Textarea id="edit-desc" {...editForm.register('description')} />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" isLoading={updateMutation.isPending}>
              Save Changes
            </Button>
            <Button type="button" variant="outline" onClick={() => setEditingItem(null)}>
              Cancel
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── Adjust Stock Modal ── */}
      <Modal
        isOpen={!!adjustingItem}
        onClose={() => setAdjustingItem(null)}
        title={`Adjust Stock — ${adjustingItem?.name}`}
        description={`Current on-hand: ${adjustingItem?.onHandQuantity} · Available: ${adjustingItem?.availableQuantity}`}
      >
        <form onSubmit={adjustForm.handleSubmit((d) => adjustMutation.mutate(d))} className="space-y-4">
          <div className="space-y-2">
            <Label>Type</Label>
            <div className="flex gap-3">
              {(['RESTOCK', 'ADJUSTMENT'] as const).map((t) => (
                <label key={t} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value={t}
                    {...adjustForm.register('type')}
                    className="h-4 w-4"
                  />
                  <span className="text-sm flex items-center gap-1 font-semibold text-slate-700">
                    {t === 'RESTOCK'
                      ? <><HugeiconsIcon icon={TradeUpIcon} className="h-3.5 w-3.5 text-emerald-600" strokeWidth={1.5} /> Restock</>
                      : <><HugeiconsIcon icon={TradeDownIcon} className="h-3.5 w-3.5 text-rose-500" strokeWidth={1.5} /> Write-off</>
                    }
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="adj-qty" required>Quantity</Label>
            <Input
              id="adj-qty"
              type="number"
              step="0.01"
              min="0.01"
              {...adjustForm.register('quantity', { valueAsNumber: true })}
              error={adjustForm.formState.errors.quantity?.message}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="adj-notes">Notes</Label>
            <Input
              id="adj-notes"
              placeholder="e.g., Received from supplier"
              {...adjustForm.register('notes')}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" isLoading={adjustMutation.isPending}>
              Apply Adjustment
            </Button>
            <Button type="button" variant="outline" onClick={() => setAdjustingItem(null)}>
              Cancel
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── Stock Movements Modal ── */}
      <Modal
        isOpen={!!movementsItem}
        onClose={() => setMovementsItem(null)}
        title={`Stock History — ${movementsItem?.name}`}
        description="Recent stock movements for this item"
      >
        {movementsLoading ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : movements && movements.length > 0 ? (
          <div className="divide-y divide-[#eef4ff]/50 max-h-96 overflow-y-auto pr-1">
            {movements.map((m: StockMovement) => (
              <div key={m.id} className="flex items-center justify-between py-3.5 text-xs font-semibold text-slate-700">
                <div>
                  <span className={cn("font-bold text-xs", movementColor(m.type))}>
                    {movementLabel(m.type)}
                  </span>
                  {m.notes && (
                    <p className="text-[10px] text-slate-400 font-semibold mt-1">{m.notes}</p>
                  )}
                  <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                    {new Date(m.createdAt).toLocaleDateString()} · {m.onHandBefore} → {m.onHandAfter}
                  </p>
                </div>
                <span className={cn("font-extrabold tabular-nums text-xs", m.quantity >= 0 ? 'text-emerald-700' : 'text-rose-600')}>
                  {m.quantity >= 0 ? '+' : ''}{m.quantity}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-xs text-muted-foreground font-semibold">No stock movements yet</p>
        )}
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
        title="Delete Inventory Item"
        description={`Are you sure you want to delete the inventory item "${itemToDelete?.name}"? This action cannot be undone and will permanently remove this item from inventory tracking.`}
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous={true}
        isLoading={deleteMutation.isPending}
      />
    </div>
  )
}
