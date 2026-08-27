import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, ListOrdered } from 'lucide-react'
import { Header } from '@/components/layout'
import { Button, Input, Label, Card, CardContent, Badge, ConfirmDialog, EmptyState } from '@/components/ui'
import { Modal } from '@/components/shared/Modal'
import { orderTypesApi } from '@/api'
import type { OrderType } from '@/types'

const orderTypeSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  sortOrder: z.number().optional(),
  requiresTable: z.boolean().optional(),
})

type OrderTypeFormData = z.infer<typeof orderTypeSchema>

export function OrderTypesPage() {
  const queryClient = useQueryClient()

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<OrderType | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  const { data: orderTypes, isLoading } = useQuery({
    queryKey: ['order-types'],
    queryFn: () => orderTypesApi.list(),
  })

  const form = useForm<OrderTypeFormData>({ resolver: zodResolver(orderTypeSchema) })

  const save = useMutation({
    mutationFn: (data: OrderTypeFormData) =>
      editing ? orderTypesApi.update(editing.id, data) : orderTypesApi.create({ name: data.name, sortOrder: data.sortOrder, requiresTable: data.requiresTable }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order-types'] })
      toast.success(editing ? 'Order type updated' : 'Order type created')
      setModalOpen(false)
      setEditing(null)
      form.reset()
    },
    onError: (error: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      toast.error(error.response?.data?.message || 'Failed to save order type')
    },
  })

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => orderTypesApi.update(id, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['order-types'] }),
    onError: () => toast.error('Failed to update order type'),
  })

  const remove = useMutation({
    mutationFn: (id: string) => orderTypesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order-types'] })
      toast.success('Order type deleted')
      setDeleteTarget(null)
    },
    onError: () => toast.error('Failed to delete order type'),
  })

  const openNew = () => {
    setEditing(null)
    form.reset({ name: '', sortOrder: (orderTypes?.length ?? 0) + 1, requiresTable: false })
    setModalOpen(true)
  }

  const openEdit = (orderType: OrderType) => {
    setEditing(orderType)
    form.reset({ name: orderType.name, sortOrder: orderType.sortOrder, requiresTable: orderType.requiresTable })
    setModalOpen(true)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header
        title="Order Types"
        description="Customize the order types shown when taking a new order — e.g. add one for room service if you run a hotel"
        icon={ListOrdered}
        action={
          <Button size="sm" onClick={openNew}>
            <Plus className="mr-1.5 h-4 w-4" /> Order Type
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {!isLoading && (!orderTypes || orderTypes.length === 0) ? (
          <EmptyState
            icon={ListOrdered}
            title="No order types yet"
            description="Add your first order type — Dine In, Takeaway, or something specific to your business"
            actionLabel="Add Order Type"
            onAction={openNew}
          />
        ) : (
          <Card className="overflow-hidden p-0">
            <CardContent className="divide-y divide-border p-0">
              {orderTypes
                ?.slice()
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((orderType) => (
                  <div key={orderType.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-semibold text-foreground">{orderType.name}</h3>
                      {orderType.requiresTable && (
                        <p className="mt-0.5 text-xs text-muted-foreground">Requires a table</p>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">Order: {orderType.sortOrder}</span>
                    <button
                      onClick={() => toggleActive.mutate({ id: orderType.id, isActive: !orderType.isActive })}
                      className="shrink-0"
                    >
                      <Badge variant={orderType.isActive ? 'success' : 'secondary'}>
                        {orderType.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      <button onClick={() => openEdit(orderType)} className="rounded-lg p-2 hover:bg-muted">
                        <Pencil className="h-4 w-4 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget({ id: orderType.id, name: orderType.name })}
                        className="rounded-lg p-2 hover:bg-muted"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </button>
                    </div>
                  </div>
                ))}
            </CardContent>
          </Card>
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Order Type' : 'New Order Type'}>
        <form onSubmit={form.handleSubmit((data) => save.mutate(data))} className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input {...form.register('name')} placeholder="e.g. Hotel Room Service" />
            {form.formState.errors.name && (
              <p className="mt-1 text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div>
            <Label>Sort Order</Label>
            <Input type="number" {...form.register('sortOrder', { valueAsNumber: true })} />
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <input type="checkbox" {...form.register('requiresTable')} className="h-4 w-4 rounded border-border accent-primary" />
            Requires a table
          </label>
          <Button type="submit" className="w-full" isLoading={save.isPending}>
            {editing ? 'Save Changes' : 'Create Order Type'}
          </Button>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && remove.mutate(deleteTarget.id)}
        title={`Delete "${deleteTarget?.name}"?`}
        description="This cannot be undone. Existing orders keep this type's name — only new orders lose the option."
        confirmText="Delete"
        isDangerous
        isLoading={remove.isPending}
      />
    </div>
  )
}
