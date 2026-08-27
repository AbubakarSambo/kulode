import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Wallet } from 'lucide-react'
import { Header } from '@/components/layout'
import { Button, Input, Label, Card, CardContent, Badge, ConfirmDialog, EmptyState } from '@/components/ui'
import { Modal } from '@/components/shared/Modal'
import { paymentTypesApi } from '@/api'
import type { PaymentType } from '@/types'

const paymentTypeSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  sortOrder: z.number().optional(),
})

type PaymentTypeFormData = z.infer<typeof paymentTypeSchema>

export function PaymentTypesPage() {
  const queryClient = useQueryClient()

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<PaymentType | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  const { data: paymentTypes, isLoading } = useQuery({
    queryKey: ['payment-types'],
    queryFn: () => paymentTypesApi.list(),
  })

  const form = useForm<PaymentTypeFormData>({ resolver: zodResolver(paymentTypeSchema) })

  const save = useMutation({
    mutationFn: (data: PaymentTypeFormData) =>
      editing ? paymentTypesApi.update(editing.id, data) : paymentTypesApi.create({ name: data.name, sortOrder: data.sortOrder }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-types'] })
      toast.success(editing ? 'Payment type updated' : 'Payment type created')
      setModalOpen(false)
      setEditing(null)
      form.reset()
    },
    onError: (error: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      toast.error(error.response?.data?.message || 'Failed to save payment type')
    },
  })

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => paymentTypesApi.update(id, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payment-types'] }),
    onError: () => toast.error('Failed to update payment type'),
  })

  const remove = useMutation({
    mutationFn: (id: string) => paymentTypesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-types'] })
      toast.success('Payment type deleted')
      setDeleteTarget(null)
    },
    onError: () => toast.error('Failed to delete payment type'),
  })

  const openNew = () => {
    setEditing(null)
    form.reset({ name: '', sortOrder: (paymentTypes?.length ?? 0) + 1 })
    setModalOpen(true)
  }

  const openEdit = (paymentType: PaymentType) => {
    setEditing(paymentType)
    form.reset({ name: paymentType.name, sortOrder: paymentType.sortOrder })
    setModalOpen(true)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header
        title="Payment Types"
        description="Customize the payment methods shown when closing an order — Paystack and Wallet are always available and can't be edited here"
        icon={Wallet}
        action={
          <Button size="sm" onClick={openNew}>
            <Plus className="mr-1.5 h-4 w-4" /> Payment Type
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {!isLoading && (!paymentTypes || paymentTypes.length === 0) ? (
          <EmptyState
            icon={Wallet}
            title="No payment types yet"
            description="Add your first payment type — Cash, Bank Transfer, Card, or something specific to your business"
            actionLabel="Add Payment Type"
            onAction={openNew}
          />
        ) : (
          <Card className="overflow-hidden p-0">
            <CardContent className="divide-y divide-border p-0">
              {paymentTypes
                ?.slice()
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((paymentType) => (
                  <div key={paymentType.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-semibold text-foreground">{paymentType.name}</h3>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">Order: {paymentType.sortOrder}</span>
                    <button
                      onClick={() => toggleActive.mutate({ id: paymentType.id, isActive: !paymentType.isActive })}
                      className="shrink-0"
                    >
                      <Badge variant={paymentType.isActive ? 'success' : 'secondary'}>
                        {paymentType.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      <button onClick={() => openEdit(paymentType)} className="rounded-lg p-2 hover:bg-muted">
                        <Pencil className="h-4 w-4 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget({ id: paymentType.id, name: paymentType.name })}
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

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Payment Type' : 'New Payment Type'}>
        <form onSubmit={form.handleSubmit((data) => save.mutate(data))} className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input {...form.register('name')} placeholder="e.g. POS Terminal - GTBank" />
            {form.formState.errors.name && (
              <p className="mt-1 text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div>
            <Label>Sort Order</Label>
            <Input type="number" {...form.register('sortOrder', { valueAsNumber: true })} />
          </div>
          <Button type="submit" className="w-full" isLoading={save.isPending}>
            {editing ? 'Save Changes' : 'Create Payment Type'}
          </Button>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && remove.mutate(deleteTarget.id)}
        title={`Delete "${deleteTarget?.name}"?`}
        description="This cannot be undone. Existing payments keep this type's name — only new payments lose the option."
        confirmText="Delete"
        isDangerous
        isLoading={remove.isPending}
      />
    </div>
  )
}
