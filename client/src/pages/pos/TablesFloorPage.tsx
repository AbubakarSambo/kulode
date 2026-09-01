import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Pencil, Plus, UtensilsCrossed } from 'lucide-react'
import { DiningTableIcon } from '@hugeicons/core-free-icons'
import { Header } from '@/components/layout'
import { Button, Input, Label, EmptyState } from '@/components/ui'
import { Modal } from '@/components/shared/Modal'
import { tablesApi, ordersApi } from '@/api'
import { cn, formatCurrency } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth'
import type { RestaurantTable, TableStatus } from '@/types'

// Statuses where a table still has a running, unpaid tab worth showing on its card.
const ACTIVE_ORDER_STATUSES = ['OPEN', 'IN_KITCHEN', 'READY', 'CLOSED_UNPAID'] as const
// Matches the backend's @Roles list on POST/PATCH /restaurant-tables.
const TABLE_MANAGE_ROLES = ['SUPER_ADMIN', 'ADMIN', 'CASHIER']

const tableSchema = z.object({
  name: z.string().min(1, 'Table name is required'),
  section: z.string().optional(),
  capacity: z.number().min(1).optional(),
})
type TableFormData = z.infer<typeof tableSchema>

const STATUS_STYLES: Record<TableStatus, string> = {
  AVAILABLE: 'bg-success/10 text-success border-success/20',
  OCCUPIED: 'bg-primary/10 text-primary border-primary/20',
  RESERVED: 'bg-warning/40 text-warning-foreground border-warning/50',
  NEEDS_CLEANING: 'bg-destructive/10 text-destructive border-destructive/20',
}

const STATUS_LABELS: Record<TableStatus, string> = {
  AVAILABLE: 'Available',
  OCCUPIED: 'Occupied',
  RESERVED: 'Reserved',
  NEEDS_CLEANING: 'Needs Cleaning',
}

export function TablesFloorPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  const canManageTables = !!currentUser && currentUser.roles.some((r) => TABLE_MANAGE_ROLES.includes(r))
  const [createOpen, setCreateOpen] = useState(false)
  const [navigatingTableId, setNavigatingTableId] = useState<string | null>(null)
  const [stuckTable, setStuckTable] = useState<RestaurantTable | null>(null)

  const { data: tables, isLoading } = useQuery({
    queryKey: ['restaurant-tables'],
    queryFn: () => tablesApi.list(),
    refetchInterval: 15_000,
  })

  const { data: activeOrdersPage } = useQuery({
    queryKey: ['orders', { statuses: ACTIVE_ORDER_STATUSES }],
    queryFn: () => ordersApi.list({ statuses: [...ACTIVE_ORDER_STATUSES], limit: 100 }),
    refetchInterval: 15_000,
  })
  // A table has at most one running order at a time in practice — first match is enough.
  const totalByTableId = new Map((activeOrdersPage?.data ?? []).filter((o) => o.tableId).map((o) => [o.tableId!, o.total]))
  const waiterByTableId = new Map(
    (activeOrdersPage?.data ?? [])
      .filter((o) => o.tableId && o.waiter)
      .map((o) => [o.tableId!, `${o.waiter!.firstName} ${o.waiter!.lastName}`]),
  )

  // Groups tables by section, normalizing case/whitespace so "Patio", "patio", and " Patio " land
  // in the same bucket (each group keeps the first-seen casing as its display label). Tables with
  // no section fall into "Unassigned", always shown last.
  const sectionGroups = useMemo(() => {
    const groups = new Map<string, { label: string; tables: RestaurantTable[] }>()
    for (const table of tables ?? []) {
      const trimmed = table.section?.trim()
      const key = trimmed ? trimmed.toLowerCase() : ''
      const existing = groups.get(key)
      if (existing) {
        existing.tables.push(table)
      } else {
        groups.set(key, { label: trimmed || 'Unassigned', tables: [table] })
      }
    }
    return Array.from(groups.values()).sort((a, b) => {
      if (a.label === 'Unassigned') return 1
      if (b.label === 'Unassigned') return -1
      return a.label.localeCompare(b.label)
    })
  }, [tables])

  // Distinct sections already in use, for quick-pick chips instead of retyping one that exists —
  // sections aren't a separate managed entity, just free text on each table.
  const existingSections = useMemo(() => {
    const seen = new Map<string, string>()
    for (const table of tables ?? []) {
      const trimmed = table.section?.trim()
      if (trimmed && !seen.has(trimmed.toLowerCase())) seen.set(trimmed.toLowerCase(), trimmed)
    }
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b))
  }, [tables])

  const form = useForm<TableFormData>({ resolver: zodResolver(tableSchema) })

  const createTable = useMutation({
    mutationFn: (data: TableFormData) => tablesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] })
      toast.success('Table added')
      setCreateOpen(false)
      form.reset()
    },
    onError: () => toast.error('Failed to add table'),
  })

  const [editingTable, setEditingTable] = useState<RestaurantTable | null>(null)
  const editForm = useForm<TableFormData>({ resolver: zodResolver(tableSchema) })

  const updateTable = useMutation({
    mutationFn: (data: TableFormData) => tablesApi.update(editingTable!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] })
      toast.success('Table updated')
      setEditingTable(null)
    },
    onError: () => toast.error('Failed to update table'),
  })

  const openEdit = (table: RestaurantTable) => {
    editForm.reset({ name: table.name, section: table.section ?? '', capacity: table.capacity ?? undefined })
    setEditingTable(table)
  }

  const markCleaned = useMutation({
    mutationFn: (id: string) => tablesApi.updateStatus(id, 'AVAILABLE'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] }),
  })

  const releaseTable = useMutation({
    mutationFn: (id: string) => tablesApi.updateStatus(id, 'AVAILABLE'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] })
      toast.success('Table released')
      setStuckTable(null)
    },
  })

  const handleTableClick = async (table: RestaurantTable) => {
    if (table.status === 'NEEDS_CLEANING') {
      markCleaned.mutate(table.id)
      return
    }
    setNavigatingTableId(table.id)
    try {
      const { data: orders } = await queryClient.fetchQuery({
        queryKey: ['orders-for-table', table.id],
        queryFn: () => ordersApi.list({ tableId: table.id }),
      })
      const openOrder = orders.find((o) => (ACTIVE_ORDER_STATUSES as readonly string[]).includes(o.status))
      if (openOrder) {
        navigate(`/pos/orders/${openOrder.id}`)
      } else if (table.status === 'OCCUPIED') {
        // Table is marked occupied but no active order points back to it (e.g. its order
        // was merged into a bill on a different table). Don't silently start a new order.
        setStuckTable(table)
      } else {
        navigate(`/pos/order/new?tableId=${table.id}`)
      }
    } finally {
      setNavigatingTableId(null)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header
        title="Tables"
        description="Tap a table to start or resume an order"
        icon={UtensilsCrossed}
        action={
          canManageTables ? (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Add Table
            </Button>
          ) : undefined
        }
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {!isLoading && (!tables || tables.length === 0) ? (
          <EmptyState
            icon={DiningTableIcon}
            title="No tables yet"
            description="Add your restaurant's tables to start taking dine-in orders"
            actionLabel={canManageTables ? 'Add Table' : undefined}
            onAction={canManageTables ? () => setCreateOpen(true) : undefined}
          />
        ) : (
          <div className="space-y-6">
            {sectionGroups.map((group) => (
              <div key={group.label}>
                {sectionGroups.length > 1 && (
                  <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{group.label}</h2>
                )}
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {group.tables.map((table) => (
                    <div
                      key={table.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleTableClick(table)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          handleTableClick(table)
                        }
                      }}
                      aria-disabled={navigatingTableId === table.id}
                      className={cn(
                        'relative flex flex-col items-center justify-center gap-2 rounded-2xl border p-6 text-center transition-all active:scale-95',
                        navigatingTableId === table.id ? 'pointer-events-none opacity-60' : 'cursor-pointer',
                        STATUS_STYLES[table.status],
                      )}
                    >
                      {canManageTables && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            openEdit(table)
                          }}
                          aria-label={`Edit ${table.name}`}
                          className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-background/70 text-foreground/70 hover:bg-background"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                      <span className="text-lg font-bold">{table.name}</span>
                      <span className="text-xs font-semibold uppercase tracking-wide">{STATUS_LABELS[table.status]}</span>
                      {totalByTableId.has(table.id) && (
                        <span className="text-sm font-bold">{formatCurrency(totalByTableId.get(table.id)!)}</span>
                      )}
                      {waiterByTableId.has(table.id) && (
                        <span className="text-[11px] opacity-70">{waiterByTableId.get(table.id)}</span>
                      )}
                      <span className="text-[11px] opacity-70">{table.capacity} seats</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Add Table">
        <form onSubmit={form.handleSubmit((data) => createTable.mutate(data))} className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input {...form.register('name')} placeholder="e.g. Table 5" />
          </div>
          <div>
            <Label>Section (optional)</Label>
            {existingSections.length > 0 && (
              <div className="mb-1.5 flex flex-wrap gap-1.5">
                {existingSections.map((section) => (
                  <button
                    key={section}
                    type="button"
                    onClick={() => form.setValue('section', section, { shouldDirty: true })}
                    className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/70"
                  >
                    {section}
                  </button>
                ))}
              </div>
            )}
            <Input {...form.register('section')} placeholder="e.g. Patio" />
          </div>
          <div>
            <Label>Capacity (optional)</Label>
            <Input
              type="number"
              {...form.register('capacity', { setValueAs: (v) => (v === '' ? undefined : Number(v)) })}
              placeholder="2"
            />
          </div>
          <Button type="submit" className="w-full" isLoading={createTable.isPending}>
            Add Table
          </Button>
        </form>
      </Modal>

      <Modal isOpen={!!editingTable} onClose={() => setEditingTable(null)} title="Edit Table">
        <form onSubmit={editForm.handleSubmit((data) => updateTable.mutate(data))} className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input {...editForm.register('name')} placeholder="e.g. Table 5" />
          </div>
          <div>
            <Label>Section (optional)</Label>
            {existingSections.length > 0 && (
              <div className="mb-1.5 flex flex-wrap gap-1.5">
                {existingSections.map((section) => (
                  <button
                    key={section}
                    type="button"
                    onClick={() => editForm.setValue('section', section, { shouldDirty: true })}
                    className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/70"
                  >
                    {section}
                  </button>
                ))}
              </div>
            )}
            <Input {...editForm.register('section')} placeholder="e.g. Patio" />
          </div>
          <div>
            <Label>Capacity (optional)</Label>
            <Input
              type="number"
              {...editForm.register('capacity', { setValueAs: (v) => (v === '' ? undefined : Number(v)) })}
              placeholder="2"
            />
          </div>
          <Button type="submit" className="w-full" isLoading={updateTable.isPending}>
            Save Changes
          </Button>
        </form>
      </Modal>

      <Modal isOpen={!!stuckTable} onClose={() => setStuckTable(null)} title="No active order found">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {stuckTable?.name} is marked occupied, but it has no active order — it may have been merged into a bill
            on another table. Release it if the guests have left, or start a new order for this table.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              className="flex-1"
              isLoading={releaseTable.isPending}
              onClick={() => stuckTable && releaseTable.mutate(stuckTable.id)}
            >
              Release Table
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                if (stuckTable) navigate(`/pos/order/new?tableId=${stuckTable.id}`)
                setStuckTable(null)
              }}
            >
              Start New Order
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
