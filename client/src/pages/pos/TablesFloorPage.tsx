import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Plus, UtensilsCrossed } from 'lucide-react'
import { DiningTableIcon } from '@hugeicons/core-free-icons'
import { Header } from '@/components/layout'
import { Button, Input, Label, EmptyState } from '@/components/ui'
import { Modal } from '@/components/shared/Modal'
import { tablesApi, ordersApi } from '@/api'
import { cn } from '@/lib/utils'
import type { RestaurantTable, TableStatus } from '@/types'

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
  const [createOpen, setCreateOpen] = useState(false)
  const [navigatingTableId, setNavigatingTableId] = useState<string | null>(null)

  const { data: tables, isLoading } = useQuery({
    queryKey: ['restaurant-tables'],
    queryFn: () => tablesApi.list(),
    refetchInterval: 15_000,
  })

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

  const markCleaned = useMutation({
    mutationFn: (id: string) => tablesApi.updateStatus(id, 'AVAILABLE'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] }),
  })

  const handleTableClick = async (table: RestaurantTable) => {
    if (table.status === 'NEEDS_CLEANING') {
      markCleaned.mutate(table.id)
      return
    }
    setNavigatingTableId(table.id)
    try {
      const orders = await queryClient.fetchQuery({
        queryKey: ['orders-for-table', table.id],
        queryFn: () => ordersApi.list({ tableId: table.id }),
      })
      const openOrder = orders.find((o) => ['OPEN', 'IN_KITCHEN', 'READY'].includes(o.status))
      if (openOrder) {
        navigate(`/pos/orders/${openOrder.id}`)
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
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Add Table
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {!isLoading && (!tables || tables.length === 0) ? (
          <EmptyState
            icon={DiningTableIcon}
            title="No tables yet"
            description="Add your restaurant's tables to start taking dine-in orders"
            actionLabel="Add Table"
            onAction={() => setCreateOpen(true)}
          />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {tables?.map((table) => (
              <button
                key={table.id}
                onClick={() => handleTableClick(table)}
                disabled={navigatingTableId === table.id}
                className={cn(
                  'flex flex-col items-center justify-center gap-2 rounded-2xl border p-6 text-center transition-all active:scale-95 disabled:opacity-60',
                  STATUS_STYLES[table.status],
                )}
              >
                <span className="text-lg font-bold">{table.name}</span>
                {table.section && <span className="text-xs opacity-70">{table.section}</span>}
                <span className="text-xs font-semibold uppercase tracking-wide">{STATUS_LABELS[table.status]}</span>
                <span className="text-[11px] opacity-70">{table.capacity} seats</span>
              </button>
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
            <Input {...form.register('section')} placeholder="e.g. Patio" />
          </div>
          <div>
            <Label>Capacity</Label>
            <Input type="number" {...form.register('capacity', { valueAsNumber: true })} placeholder="2" />
          </div>
          <Button type="submit" className="w-full" isLoading={createTable.isPending}>
            Add Table
          </Button>
        </form>
      </Modal>
    </div>
  )
}
