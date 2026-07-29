import { useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react'
import { Header } from '@/components/layout'
import { Button, Input, Label, Card, CardContent, Badge, ConfirmDialog } from '@/components/ui'
import { Modal } from '@/components/shared/Modal'
import { customersApi } from '@/api'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Customer, OrderStatus, OrderSource } from '@/types'

interface CustomerOrderSummary {
  id: string
  status: OrderStatus
  total: number
  source: OrderSource
  createdAt: string
  closedAt?: string
}

type CustomerWithOrders = Customer & { orders: CustomerOrderSummary[] }

const customerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().min(1, 'Phone is required'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  notes: z.string().optional(),
})
type CustomerFormData = z.infer<typeof customerSchema>

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const { data: customer, isLoading } = useQuery({
    queryKey: ['customers', id],
    queryFn: () => customersApi.get(id!) as Promise<CustomerWithOrders>,
    enabled: !!id,
  })

  const form = useForm<CustomerFormData>({ resolver: zodResolver(customerSchema) })

  const updateCustomer = useMutation({
    mutationFn: (data: CustomerFormData) =>
      customersApi.update(id!, { ...data, email: data.email || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers', id] })
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      toast.success('Customer updated')
      setEditOpen(false)
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(message || 'Failed to update customer')
    },
  })

  const deleteCustomer = useMutation({
    mutationFn: () => customersApi.delete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      toast.success('Customer deactivated')
      navigate('/pos/customers')
    },
  })

  if (isLoading || !customer) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header
        title={customer.name}
        description={customer.phone}
        action={
          <Button variant="ghost" size="sm" onClick={() => navigate('/pos/customers')}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-4 md:col-span-1">
            <CardContent className="space-y-3 p-0">
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-foreground">{customer.name}</span>
                {!customer.isActive && <Badge variant="default">Inactive</Badge>}
              </div>
              <div className="space-y-1 text-sm">
                <div className="text-muted-foreground">Phone</div>
                <div className="font-medium text-foreground">{customer.phone}</div>
              </div>
              {customer.email && (
                <div className="space-y-1 text-sm">
                  <div className="text-muted-foreground">Email</div>
                  <div className="font-medium text-foreground">{customer.email}</div>
                </div>
              )}
              {customer.notes && (
                <div className="space-y-1 text-sm">
                  <div className="text-muted-foreground">Notes</div>
                  <div className="font-medium text-foreground">{customer.notes}</div>
                </div>
              )}
              <div className="space-y-1 text-sm">
                <div className="text-muted-foreground">Customer since</div>
                <div className="font-medium text-foreground">{formatDate(customer.createdAt)}</div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    form.reset({
                      name: customer.name,
                      phone: customer.phone,
                      email: customer.email ?? '',
                      notes: customer.notes ?? '',
                    })
                    setEditOpen(true)
                  }}
                >
                  <Pencil className="mr-1.5 h-4 w-4" /> Edit
                </Button>
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="mr-1.5 h-4 w-4" /> Delete
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="p-4 md:col-span-2">
            <CardContent className="p-0">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold text-foreground">Order History</h3>
                <Link
                  to={`/pos/orders?customerId=${customer.id}`}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  View all orders
                </Link>
              </div>
              {customer.orders.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No orders yet</p>
              ) : (
                <div className="space-y-2">
                  {customer.orders.map((order) => (
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

      <Modal isOpen={editOpen} onClose={() => setEditOpen(false)} title="Edit Customer">
        <form onSubmit={form.handleSubmit((data) => updateCustomer.mutate(data))} className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input {...form.register('name')} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input {...form.register('phone')} />
          </div>
          <div>
            <Label>Email (optional)</Label>
            <Input type="email" {...form.register('email')} />
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Input {...form.register('notes')} />
          </div>
          <Button type="submit" className="w-full" isLoading={updateCustomer.isPending}>
            Save Changes
          </Button>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => deleteCustomer.mutate()}
        title="Delete Customer"
        description={`Are you sure you want to delete ${customer.name}? Their past orders will be kept but no longer editable to this profile.`}
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous
        isLoading={deleteCustomer.isPending}
      />
    </div>
  )
}
