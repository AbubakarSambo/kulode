import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Plus, Edit, Trash2, Wrench, Search } from 'lucide-react'
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

const getInitials = (name: string) => {
  if (!name) return '??'
  const cleanName = name.replace(/[^a-zA-Z0-9\s]/g, '').trim()
  const parts = cleanName.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '??'
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

export function ServiceItemsPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
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
      toast.success('Service item created successfully')
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
      toast.success('Service item updated successfully')
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
      toast.success('Service item deleted successfully')
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

  const filteredItems = (serviceItems ?? []).filter((item) => 
    item.name.toLowerCase().includes(search.toLowerCase()) ||
    (item.description && item.description.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="Service Items"
        description="Manage predefined services and products for invoices"
        icon={Wrench}
        category="Settings"
        badgeText={serviceItems?.length}
        action={
          <Button onClick={openCreateModal}>
            <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
            Add Service Item
          </Button>
        }
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {/* Search */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between stagger-in sticky top-0 md:static z-20 bg-[#f8f9ff]/95 backdrop-blur-sm py-3 -mx-4 px-4 md:-mx-0 md:px-0 md:bg-transparent md:py-0 md:mb-6 border-b border-[#eef4ff]/30 md:border-b-0">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={1.5} />
            <Input
              placeholder="Search service items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-11 rounded-xl h-10"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : filteredItems.length > 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredItems.map((item) => (
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
                        <h3 className="font-bold text-slate-900 text-sm leading-tight">{item.name}</h3>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 -mt-1 -mr-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 p-0 rounded-lg" onClick={() => openEditModal(item)} title="Edit">
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
                        <p className="mt-2 text-xs text-slate-500 font-semibold leading-relaxed line-clamp-3">
                          {item.description}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border-0 bg-white shadow-[0px_12px_32px_rgba(0,55,176,0.03)] rounded-[24px]">
            <CardContent className="py-12 text-center">
              <p className="font-bold text-slate-800 text-sm">No service items found</p>
              <p className="mt-1 text-xs text-slate-400">
                Add services or products that you frequently include in invoices.
              </p>
              <Button className="mt-4" onClick={openCreateModal}>
                Add your first service item
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Mobile Floating Action Button */}
      <Button 
        onClick={openCreateModal}
        className="fixed bottom-28 right-6 z-40 sm:hidden w-14 h-14 rounded-full bg-gradient-to-br from-[#0037b0] to-[#1d4ed8] text-white flex items-center justify-center shadow-[0px_8px_24px_rgba(0,55,176,0.25)] hover:scale-105 active:scale-95 transition-all p-0"
        aria-label="Add Service Item"
      >
        <Plus className="h-6 w-6" strokeWidth={1.5} />
      </Button>

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
