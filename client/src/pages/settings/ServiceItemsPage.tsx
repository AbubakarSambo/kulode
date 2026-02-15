import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Plus, Edit, Trash2 } from 'lucide-react'
import { Header } from '@/components/layout'
import { Button, Input, Label, Textarea, Card, CardContent } from '@/components/ui'
import { Modal } from '@/components/shared/Modal'
import { invoicesApi } from '@/api'
import { formatCurrency } from '@/lib/utils'
import { posthog } from '@/lib/posthog'
import type { ServiceItem } from '@/types'

const serviceItemSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  unitPrice: z.number().min(0, 'Price must be 0 or greater'),
})

type ServiceItemFormData = z.infer<typeof serviceItemSchema>

export function ServiceItemsPage() {
  const queryClient = useQueryClient()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<ServiceItem | null>(null)

  const { data: serviceItems, isLoading } = useQuery({
    queryKey: ['service-items'],
    queryFn: () => invoicesApi.listServiceItems(),
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ServiceItemFormData>({
    resolver: zodResolver(serviceItemSchema),
    defaultValues: {
      name: '',
      description: '',
      unitPrice: 0,
    },
  })

  const createMutation = useMutation({
    mutationFn: (data: ServiceItemFormData) => invoicesApi.createServiceItem(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-items'] })
      posthog.capture('service_item_created')
      toast.success('Service item created')
      closeModal()
    },
    onError: (error: any) => {
      toast.error('Failed to create service item', {
        description: error.response?.data?.message,
      })
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: ServiceItemFormData) => invoicesApi.updateServiceItem(editingItem!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-items'] })
      posthog.capture('service_item_updated')
      toast.success('Service item updated')
      closeModal()
    },
    onError: (error: any) => {
      toast.error('Failed to update service item', {
        description: error.response?.data?.message,
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => invoicesApi.deleteServiceItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-items'] })
      posthog.capture('service_item_deleted')
      toast.success('Service item deleted')
    },
    onError: (error: any) => {
      toast.error('Failed to delete service item', {
        description: error.response?.data?.message,
      })
    },
  })

  const openCreateModal = () => {
    setEditingItem(null)
    reset({ name: '', description: '', unitPrice: 0 })
    setIsModalOpen(true)
  }

  const openEditModal = (item: ServiceItem) => {
    setEditingItem(item)
    reset({ name: item.name, description: item.description || '', unitPrice: item.unitPrice })
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingItem(null)
    reset({ name: '', description: '', unitPrice: 0 })
  }

  const onSubmit = (data: ServiceItemFormData) => {
    if (editingItem) {
      updateMutation.mutate(data)
    } else {
      createMutation.mutate(data)
    }
  }

  const handleDelete = (item: ServiceItem) => {
    if (window.confirm(`Delete "${item.name}"? This won't affect existing invoices.`)) {
      deleteMutation.mutate(item.id)
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="Service Items"
        description="Manage predefined services and products for invoices"
        action={
          <Button onClick={openCreateModal}>
            <Plus className="mr-2 h-4 w-4" />
            Add Service Item
          </Button>
        }
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : serviceItems && serviceItems.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {serviceItems.map((item) => (
              <Card key={item.id}>
                <CardContent className="flex items-start justify-between p-4">
                  <div className="flex-1">
                    <h3 className="font-medium">{item.name}</h3>
                    <p className="mt-1 text-lg font-semibold text-primary">
                      {formatCurrency(item.unitPrice)}
                    </p>
                    {item.description && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {item.description}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditModal(item)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(item)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">No service items yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add services or products that you frequently include in invoices
              </p>
              <Button className="mt-4" onClick={openCreateModal}>
                Add your first service item
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingItem ? 'Edit Service Item' : 'New Service Item'}
        description={editingItem ? 'Update the service item details' : 'Create a new service or product'}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name" required>Name</Label>
            <Input
              id="name"
              placeholder="e.g., Web Design"
              {...register('name')}
              error={errors.name?.message}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="unitPrice" required>Unit Price</Label>
            <Input
              id="unitPrice"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              {...register('unitPrice', { valueAsNumber: true })}
              error={errors.unitPrice?.message}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Optional description..."
              {...register('description')}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="submit"
              isLoading={createMutation.isPending || updateMutation.isPending}
            >
              {editingItem ? 'Save Changes' : 'Create Service Item'}
            </Button>
            <Button type="button" variant="outline" onClick={closeModal}>
              Cancel
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
