import { useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react'
import { Header } from '@/components/layout'
import { Button, Input, Label, Textarea, Card, CardContent, Badge, ConfirmDialog } from '@/components/ui'
import { Modal } from '@/components/shared/Modal'
import { usersApi } from '@/api'
import { formatCurrency, formatDate } from '@/lib/utils'

const waiterSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().optional(),
  notes: z.string().optional(),
})
type WaiterFormData = z.infer<typeof waiterSchema>

function splitName(name: string): { firstName: string; lastName: string } {
  const trimmed = name.trim()
  const spaceIndex = trimmed.indexOf(' ')
  if (spaceIndex === -1) return { firstName: trimmed, lastName: '' }
  return { firstName: trimmed.slice(0, spaceIndex), lastName: trimmed.slice(spaceIndex + 1) }
}

function errorMessage(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback
}

export function WaiterDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const { data: waiter, isLoading } = useQuery({
    queryKey: ['waiter-history', id],
    queryFn: () => usersApi.getOrderHistory(id!),
    enabled: !!id,
  })

  const form = useForm<WaiterFormData>({ resolver: zodResolver(waiterSchema) })

  const updateWaiter = useMutation({
    mutationFn: (data: WaiterFormData) => {
      const { firstName, lastName } = splitName(data.name)
      return usersApi.update(id!, { firstName, lastName, phone: data.phone, notes: data.notes })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waiter-history', id] })
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['waiters-directory'] })
      toast.success('Waiter updated')
      setEditOpen(false)
    },
    onError: (err: unknown) => toast.error(errorMessage(err, 'Failed to update waiter')),
  })

  const deactivateWaiter = useMutation({
    mutationFn: () => usersApi.delete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['waiters-directory'] })
      toast.success('Waiter deactivated')
      navigate('/pos/waiters')
    },
    onError: (err: unknown) => toast.error(errorMessage(err, 'Failed to deactivate waiter')),
  })

  if (isLoading || !waiter) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  const fullName = `${waiter.firstName} ${waiter.lastName}`.trim()

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header
        title={fullName}
        description={waiter.phone ?? undefined}
        action={
          <Button variant="ghost" size="sm" onClick={() => navigate('/pos/waiters')}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-4 md:col-span-1">
            <CardContent className="space-y-3 p-0">
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-foreground">{fullName}</span>
                <Badge variant={waiter.isActive ? 'success' : 'secondary'}>
                  {waiter.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              {waiter.phone && (
                <div className="space-y-1 text-sm">
                  <div className="text-muted-foreground">Phone</div>
                  <div className="font-medium text-foreground">{waiter.phone}</div>
                </div>
              )}
              {waiter.notes && (
                <div className="space-y-1 text-sm">
                  <div className="text-muted-foreground">Notes</div>
                  <div className="font-medium text-foreground">{waiter.notes}</div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    form.reset({ name: fullName, phone: waiter.phone ?? '', notes: waiter.notes ?? '' })
                    setEditOpen(true)
                  }}
                >
                  <Pencil className="mr-1.5 h-4 w-4" /> Edit
                </Button>
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="mr-1.5 h-4 w-4" /> Deactivate
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4 md:col-span-2">
            <div className="grid grid-cols-2 gap-4">
              <Card className="p-4">
                <CardContent className="p-0">
                  <div className="text-xs text-muted-foreground">Orders Served</div>
                  <div className="text-2xl font-bold text-foreground">{waiter.stats.totalOrders}</div>
                </CardContent>
              </Card>
              <Card className="p-4">
                <CardContent className="p-0">
                  <div className="text-xs text-muted-foreground">Total Revenue</div>
                  <div className="text-2xl font-bold text-foreground">{formatCurrency(waiter.stats.totalRevenue)}</div>
                </CardContent>
              </Card>
            </div>

            <Card className="p-4">
              <CardContent className="p-0">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-semibold text-foreground">Recent Orders</h3>
                  <Link
                    to={`/pos/orders?waiterId=${waiter.id}`}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    View all orders
                  </Link>
                </div>
                {waiter.orders.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No orders yet</p>
                ) : (
                  <div className="space-y-2">
                    {waiter.orders.map((order) => (
                      <Link
                        key={order.id}
                        to={`/pos/orders/${order.id}`}
                        className="flex items-center justify-between rounded-xl border border-border p-3 hover:bg-muted/40"
                      >
                        <div>
                          <div className="text-sm font-semibold text-foreground">
                            Order #{order.id.slice(0, 8).toUpperCase()}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {order.source.replace('_', ' ')} · {formatDate(order.createdAt)}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge
                            variant={
                              order.status === 'CLOSED_PAID'
                                ? 'success'
                                : order.status === 'CANCELLED'
                                  ? 'destructive'
                                  : 'default'
                            }
                          >
                            {order.status.replace('_', ' ')}
                          </Badge>
                          <span className="text-sm font-semibold text-foreground">{formatCurrency(order.total)}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Modal isOpen={editOpen} onClose={() => setEditOpen(false)} title="Edit Waiter">
        <form onSubmit={form.handleSubmit((data) => updateWaiter.mutate(data))} className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input {...form.register('name')} />
          </div>
          <div>
            <Label>Phone (optional)</Label>
            <Input {...form.register('phone')} />
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Textarea {...form.register('notes')} />
          </div>
          <Button type="submit" className="w-full" isLoading={updateWaiter.isPending}>
            Save Changes
          </Button>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => deactivateWaiter.mutate()}
        title={`Deactivate "${fullName}"?`}
        description="They'll no longer be able to log in or be assigned to new orders."
        confirmText="Deactivate"
        cancelText="Cancel"
        isDangerous
        isLoading={deactivateWaiter.isPending}
      />
    </div>
  )
}
