import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, UserRound } from 'lucide-react'
import { WaiterIcon } from '@hugeicons/core-free-icons'
import { Header } from '@/components/layout'
import { Button, Input, Label, Textarea, Card, CardContent, Badge, ConfirmDialog, EmptyState } from '@/components/ui'
import { Modal } from '@/components/shared/Modal'
import { waitersApi } from '@/api'
import type { Waiter } from '@/types'

const waiterSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().optional(),
  notes: z.string().optional(),
})

type WaiterFormData = z.infer<typeof waiterSchema>

export function WaitersPage() {
  const queryClient = useQueryClient()

  const [waiterModalOpen, setWaiterModalOpen] = useState(false)
  const [editingWaiter, setEditingWaiter] = useState<Waiter | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  const { data: waiters, isLoading } = useQuery({
    queryKey: ['waiters'],
    queryFn: () => waitersApi.list(),
  })

  const waiterForm = useForm<WaiterFormData>({ resolver: zodResolver(waiterSchema) })

  const saveWaiter = useMutation({
    mutationFn: (data: WaiterFormData) =>
      editingWaiter ? waitersApi.update(editingWaiter.id, data) : waitersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waiters'] })
      toast.success(editingWaiter ? 'Waiter updated' : 'Waiter added')
      setWaiterModalOpen(false)
      setEditingWaiter(null)
      waiterForm.reset()
    },
    onError: () => toast.error('Failed to save waiter'),
  })

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => waitersApi.update(id, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['waiters'] }),
    onError: () => toast.error('Failed to update waiter'),
  })

  const deleteWaiter = useMutation({
    mutationFn: (id: string) => waitersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waiters'] })
      toast.success('Waiter removed')
      setDeleteTarget(null)
    },
    onError: () => toast.error('Failed to remove waiter'),
  })

  const openNewWaiter = () => {
    setEditingWaiter(null)
    waiterForm.reset({ name: '', phone: '', notes: '' })
    setWaiterModalOpen(true)
  }

  const openEditWaiter = (waiter: Waiter) => {
    setEditingWaiter(waiter)
    waiterForm.reset({ name: waiter.name, phone: waiter.phone, notes: waiter.notes })
    setWaiterModalOpen(true)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header
        title="Waiters"
        description="Manage your restaurant's floor staff"
        icon={UserRound}
        action={
          <Button size="sm" onClick={openNewWaiter}>
            <Plus className="mr-1.5 h-4 w-4" /> Waiter
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {!isLoading && (!waiters || waiters.length === 0) ? (
          <EmptyState
            icon={WaiterIcon}
            title="No waiters yet"
            description="Add your first waiter to start assigning tables and orders"
            actionLabel="Add Waiter"
            onAction={openNewWaiter}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {waiters?.map((waiter) => (
              <Card key={waiter.id} className="flex h-full flex-col p-4">
                <CardContent className="flex h-full flex-col p-0">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-foreground">{waiter.name}</h3>
                      {waiter.phone && <p className="mt-1 text-sm text-muted-foreground">{waiter.phone}</p>}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => openEditWaiter(waiter)} className="rounded-lg p-2 hover:bg-muted">
                        <Pencil className="h-4 w-4 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget({ id: waiter.id, name: waiter.name })}
                        className="rounded-lg p-2 hover:bg-muted"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </button>
                    </div>
                  </div>
                  {waiter.notes && <p className="mt-2 text-sm text-muted-foreground">{waiter.notes}</p>}
                  <div className="mt-auto flex items-center justify-end pt-3">
                    <button onClick={() => toggleActive.mutate({ id: waiter.id, isActive: !waiter.isActive })}>
                      <Badge variant={waiter.isActive ? 'success' : 'secondary'}>
                        {waiter.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal
        isOpen={waiterModalOpen}
        onClose={() => setWaiterModalOpen(false)}
        title={editingWaiter ? 'Edit Waiter' : 'New Waiter'}
      >
        <form onSubmit={waiterForm.handleSubmit((data) => saveWaiter.mutate(data))} className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input {...waiterForm.register('name')} placeholder="e.g. Tunde Bakare" />
            {waiterForm.formState.errors.name && (
              <p className="mt-1 text-xs text-destructive">{waiterForm.formState.errors.name.message}</p>
            )}
          </div>
          <div>
            <Label>Phone (optional)</Label>
            <Input {...waiterForm.register('phone')} placeholder="+234 123 456 7890" />
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Textarea {...waiterForm.register('notes')} placeholder="Optional" />
          </div>
          <Button type="submit" className="w-full" isLoading={saveWaiter.isPending}>
            {editingWaiter ? 'Save Changes' : 'Add Waiter'}
          </Button>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteWaiter.mutate(deleteTarget.id)}
        title={`Remove "${deleteTarget?.name}"?`}
        description="This cannot be undone."
        confirmText="Remove"
        isDangerous
        isLoading={deleteWaiter.isPending}
      />
    </div>
  )
}
