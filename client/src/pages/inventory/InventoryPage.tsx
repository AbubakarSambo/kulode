import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Plus, Edit, Trash2, Package, TrendingUp, TrendingDown, History, Search } from 'lucide-react'
import { Header } from '@/components/layout'
import { Button, Input, Label, Textarea, Card, CardContent, Badge } from '@/components/ui'
import { Modal } from '@/components/shared/Modal'
import { inventoryApi } from '@/api/inventory'
import { formatCurrency, cn } from '@/lib/utils'
import type { InventoryItem, StockMovement, StockMovementType } from '@/types'
import { InventoryIcon } from '@/components/ui/CustomIcons'

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
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [stockFilter, setStockFilter] = useState<'all' | 'low'>('all')

  // Modal state
  const [createOpen, setCreateOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const [adjustingItem, setAdjustingItem] = useState<InventoryItem | null>(null)
  const [movementsItem, setMovementsItem] = useState<InventoryItem | null>(null)

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
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] })
      toast.success('Inventory item created successfully')
      setCreateOpen(false)
      createForm.reset()
    },
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
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] })
      toast.success('Inventory item updated successfully')
      setEditingItem(null)
    },
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
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] })
      toast.success('Inventory item deleted successfully')
    },
    onError: (error: any) => {
      toast.error('Cannot delete inventory item', { description: error.response?.data?.message })
    },
  })

  const handleDelete = (item: InventoryItem) => {
    if (window.confirm(`Delete "${item.name}"? This action cannot be undone.`)) {
      deleteMutation.mutate(item.id)
    }
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] })
      toast.success('Stock adjusted successfully')
      setAdjustingItem(null)
      adjustForm.reset({ type: 'RESTOCK', quantity: 1, notes: '' })
    },
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

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="Inventory"
        description="Track physical goods and stock levels"
        icon={InventoryIcon}
        category="Business Ops"
        badgeText={items?.length}
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
            Add Item
          </Button>
        }
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {/* Search & Filters */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between stagger-in sticky top-0 md:static z-20 bg-[#f8f9ff]/95 backdrop-blur-sm py-3 -mx-4 px-4 md:-mx-0 md:px-0 md:bg-transparent md:py-0 md:mb-6 border-b border-[#eef4ff]/30 md:border-b-0">
          {/* Search bar */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={1.5} />
            <Input
              placeholder="Search inventory..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-11 rounded-xl h-10"
            />
          </div>

          {/* Low stock filters */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-2 whitespace-nowrap">Status:</span>
            {([
              { label: 'All Items', value: 'all' },
              { label: 'Low Stock', value: 'low' },
            ] as const).map((opt) => {
              const isActive = stockFilter === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setStockFilter(opt.value)}
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
        ) : filteredItems.length > 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredItems.map((item) => {
              const isLowStock = item.availableQuantity <= item.reorderLevel
              return (
                <Card 
                  key={item.id}
                  className="border-0 bg-white shadow-[0px_12px_32px_rgba(0,55,176,0.03)] rounded-[24px] hover:shadow-[0px_16px_40px_rgba(0,55,176,0.06)] hover:-translate-y-0.5 transition-all duration-300 relative overflow-hidden flex flex-col justify-between"
                >
                  <CardContent className="p-5 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-[#0037b0]/5 text-[#0037b0] border border-[#0037b0]/8 flex items-center justify-center text-xs font-bold shrink-0 select-none">
                            {getInitials(item.name)}
                          </div>
                          <div>
                            <h3 className="font-bold text-slate-900 text-sm leading-tight">{item.name}</h3>
                            {item.sku && (
                              <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wider">SKU: {item.sku}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 -mt-1 -mr-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 p-0 rounded-lg" onClick={() => openEdit(item)} title="Edit">
                            <Edit className="h-4 w-4 text-slate-450" strokeWidth={1.5} />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 p-0 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50" onClick={() => handleDelete(item)} title="Delete">
                            <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                          </Button>
                        </div>
                      </div>

                      <div className="mt-3">
                        <p className="text-base font-extrabold text-[#0037b0] tabular-nums">
                          {formatCurrency(item.unitPrice)}
                        </p>
                        {item.description && (
                          <p className="mt-2 text-xs text-slate-500 font-semibold leading-relaxed line-clamp-2">
                            {item.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div>
                      {/* Stock levels */}
                      <div className="mt-4 grid grid-cols-3 gap-1 rounded-2xl bg-[#eef4ff]/30 border border-[#eef4ff]/50 p-3 text-center text-xs">
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

                      {/* Action buttons & badges */}
                      <div className="mt-4 pt-4 border-t border-[#eef4ff]/40 flex items-center justify-between gap-3">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 rounded-xl flex-1 text-xs font-semibold border-slate-200/80"
                          onClick={() => openAdjust(item)}
                        >
                          <Package className="mr-1.5 h-3.5 w-3.5 text-slate-450" strokeWidth={1.5} />
                          Adjust Stock
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 rounded-xl shrink-0 border border-slate-200/40 hover:bg-slate-50"
                          onClick={() => setMovementsItem(item)}
                          title="View stock history"
                        >
                          <History className="h-4 w-4 text-slate-450" strokeWidth={1.5} />
                        </Button>

                        {isLowStock && (
                          <Badge variant="outline" className="border-rose-200 bg-rose-50/50 text-rose-600 py-0.5 px-2 rounded-md font-bold uppercase tracking-wide text-[8px] absolute top-3 right-3 shadow-sm select-none">
                            Low Stock
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        ) : (
          <Card className="border-0 bg-white shadow-[0px_12px_32px_rgba(0,55,176,0.03)] rounded-[24px]">
            <CardContent className="py-12 text-center">
              <Package className="mx-auto mb-3 h-10 w-10 text-slate-350" strokeWidth={1.5} />
              <p className="font-bold text-slate-800 text-sm">No inventory items found</p>
              <p className="mt-1 text-xs text-slate-400">
                Add physical goods to track stock levels and invoice reservations.
              </p>
              <Button className="mt-4" onClick={() => setCreateOpen(true)}>
                Add your first item
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Mobile Floating Action Button */}
      <Button 
        onClick={() => setCreateOpen(true)}
        className="fixed bottom-28 right-6 z-40 sm:hidden w-14 h-14 rounded-full bg-gradient-to-br from-[#0037b0] to-[#1d4ed8] text-white flex items-center justify-center shadow-[0px_8px_24px_rgba(0,55,176,0.25)] hover:scale-105 active:scale-95 transition-all p-0"
        aria-label="Add Item"
      >
        <Plus className="h-6 w-6" strokeWidth={1.5} />
      </Button>

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
                      ? <><TrendingUp className="h-3.5 w-3.5 text-emerald-600" /> Restock</>
                      : <><TrendingDown className="h-3.5 w-3.5 text-rose-500" /> Write-off</>
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
    </div>
  )
}
