import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Plus, Edit, Trash2, Package, TrendingUp, TrendingDown, History } from 'lucide-react'
import { Header } from '@/components/layout'
import { Button, Input, Label, Textarea, Card, CardContent, Badge } from '@/components/ui'
import { Modal } from '@/components/shared/Modal'
import { inventoryApi } from '@/api/inventory'
import { formatCurrency } from '@/lib/utils'
import type { InventoryItem, StockMovement, StockMovementType } from '@/types'

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
    case 'RESTOCK': return 'text-green-600'
    case 'ADJUSTMENT': return 'text-red-600'
    case 'INVOICE_RESERVED': return 'text-orange-500'
    case 'INVOICE_DEDUCTED': return 'text-red-600'
    case 'RESERVATION_RELEASED': return 'text-blue-500'
  }
}

// ─── Components ─────────────────────────────────────────────────────────────

export function InventoryPage() {
  const queryClient = useQueryClient()

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
      toast.success('Inventory item created')
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
      toast.success('Inventory item updated')
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
      toast.success('Inventory item deleted')
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

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="Inventory"
        description="Track physical goods and stock levels"
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Item
          </Button>
        }
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : items && items.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => {
              const isLowStock = item.availableQuantity <= item.reorderLevel
              return (
                <Card key={item.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-medium truncate">{item.name}</h3>
                          {isLowStock && (
                            <Badge variant="outline" className="border-orange-400 text-orange-600 shrink-0">
                              Low Stock
                            </Badge>
                          )}
                        </div>
                        {item.sku && (
                          <p className="text-xs text-muted-foreground mt-0.5">SKU: {item.sku}</p>
                        )}
                        <p className="mt-1 text-lg font-semibold text-primary">
                          {formatCurrency(item.unitPrice)}
                        </p>
                        {item.description && (
                          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                            {item.description}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(item)} title="Edit">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(item)} title="Delete">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>

                    {/* Stock levels */}
                    <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-muted/50 p-3 text-center text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">On Hand</p>
                        <p className="font-semibold">{item.onHandQuantity}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Reserved</p>
                        <p className="font-semibold text-orange-500">{item.reservedQuantity}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Available</p>
                        <p className={`font-semibold ${item.availableQuantity <= 0 ? 'text-destructive' : ''}`}>
                          {item.availableQuantity}
                        </p>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="mt-3 flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => openAdjust(item)}
                      >
                        <Package className="mr-1.5 h-3.5 w-3.5" />
                        Adjust Stock
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setMovementsItem(item)}
                        title="View stock history"
                      >
                        <History className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-muted-foreground">No inventory items yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add physical goods to track stock levels and reservations
              </p>
              <Button className="mt-4" onClick={() => setCreateOpen(true)}>
                Add your first item
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

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
                  <span className="text-sm flex items-center gap-1">
                    {t === 'RESTOCK'
                      ? <><TrendingUp className="h-3.5 w-3.5 text-green-600" /> Restock</>
                      : <><TrendingDown className="h-3.5 w-3.5 text-red-500" /> Write-off</>
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
          <div className="divide-y max-h-96 overflow-y-auto">
            {movements.map((m: StockMovement) => (
              <div key={m.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <span className={`font-medium ${movementColor(m.type)}`}>
                    {movementLabel(m.type)}
                  </span>
                  {m.notes && (
                    <p className="text-xs text-muted-foreground mt-0.5">{m.notes}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {new Date(m.createdAt).toLocaleDateString()} · {m.onHandBefore} → {m.onHandAfter}
                  </p>
                </div>
                <span className={`font-semibold tabular-nums ${m.quantity >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {m.quantity >= 0 ? '+' : ''}{m.quantity}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">No stock movements yet</p>
        )}
      </Modal>
    </div>
  )
}
