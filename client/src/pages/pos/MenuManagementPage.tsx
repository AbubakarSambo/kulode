import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { ChefHatIcon } from '@hugeicons/core-free-icons'
import { Header } from '@/components/layout'
import { Button, Input, Label, Textarea, Card, CardContent, Badge, ConfirmDialog, EmptyState, Select } from '@/components/ui'
import { Modal } from '@/components/shared/Modal'
import { menuCategoriesApi, menuItemsApi } from '@/api'
import { formatCurrency } from '@/lib/utils'
import type { MenuCategory, MenuItem } from '@/types'
import { InventoryIcon } from '@/components/ui/CustomIcons'

const categorySchema = z.object({
  name: z.string().min(1, 'Name is required'),
})

const itemSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  price: z.number().min(0, 'Price must be 0 or greater'),
  categoryId: z.string().optional(),
})

type CategoryFormData = z.infer<typeof categorySchema>
type ItemFormData = z.infer<typeof itemSchema>

export function MenuManagementPage() {
  const queryClient = useQueryClient()

  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const [itemModalOpen, setItemModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'category' | 'item'; id: string; name: string } | null>(null)

  const { data: categories, isLoading: categoriesLoading } = useQuery({
    queryKey: ['menu-categories'],
    queryFn: () => menuCategoriesApi.list(),
  })

  const { data: items, isLoading: itemsLoading } = useQuery({
    queryKey: ['menu-items'],
    queryFn: () => menuItemsApi.list(),
  })

  const categoryForm = useForm<CategoryFormData>({ resolver: zodResolver(categorySchema) })
  const itemForm = useForm<ItemFormData>({ resolver: zodResolver(itemSchema) })

  const createCategory = useMutation({
    mutationFn: (data: CategoryFormData) => menuCategoriesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-categories'] })
      toast.success('Category created')
      setCategoryModalOpen(false)
      categoryForm.reset()
    },
    onError: () => toast.error('Failed to create category'),
  })

  const deleteCategory = useMutation({
    mutationFn: (id: string) => menuCategoriesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-categories'] })
      toast.success('Category deleted')
      setDeleteTarget(null)
    },
    onError: () => toast.error('Failed to delete category'),
  })

  const saveItem = useMutation({
    mutationFn: (data: ItemFormData) =>
      editingItem ? menuItemsApi.update(editingItem.id, data) : menuItemsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-items'] })
      toast.success(editingItem ? 'Item updated' : 'Item created')
      setItemModalOpen(false)
      setEditingItem(null)
      itemForm.reset()
    },
    onError: () => toast.error('Failed to save item'),
  })

  const toggleAvailability = useMutation({
    mutationFn: ({ id, isAvailable }: { id: string; isAvailable: boolean }) =>
      menuItemsApi.update(id, { isAvailable }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['menu-items'] }),
    onError: () => toast.error('Failed to update availability'),
  })

  const deleteItem = useMutation({
    mutationFn: (id: string) => menuItemsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-items'] })
      toast.success('Item deleted')
      setDeleteTarget(null)
    },
    onError: () => toast.error('Failed to delete item'),
  })

  const openNewItem = () => {
    setEditingItem(null)
    itemForm.reset({ name: '', description: '', price: 0, categoryId: undefined })
    setItemModalOpen(true)
  }

  const openEditItem = (item: MenuItem) => {
    setEditingItem(item)
    itemForm.reset({ name: item.name, description: item.description, price: item.price, categoryId: item.categoryId })
    setItemModalOpen(true)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header
        title="Menu"
        description="Manage categories and menu items for your restaurant"
        icon={InventoryIcon}
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setCategoryModalOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Category
            </Button>
            <Button size="sm" onClick={openNewItem}>
              <Plus className="mr-1.5 h-4 w-4" /> Menu Item
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {!categoriesLoading && !itemsLoading && (!items || items.length === 0) ? (
          <EmptyState
            icon={ChefHatIcon}
            title="No menu items yet"
            description="Add your first menu item to start taking orders"
            actionLabel="Add Menu Item"
            onAction={openNewItem}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items?.map((item) => (
              <Card key={item.id} className="p-4">
                <CardContent className="p-0">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-foreground">{item.name}</h3>
                      {item.category && (
                        <Badge variant="secondary" className="mt-1">{item.category.name}</Badge>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => openEditItem(item)} className="rounded-lg p-2 hover:bg-muted">
                        <Pencil className="h-4 w-4 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget({ type: 'item', id: item.id, name: item.name })}
                        className="rounded-lg p-2 hover:bg-muted"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </button>
                    </div>
                  </div>
                  {item.description && <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>}
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-lg font-bold text-foreground">{formatCurrency(item.price)}</span>
                    <button
                      onClick={() => toggleAvailability.mutate({ id: item.id, isAvailable: !item.isAvailable })}
                    >
                      <Badge variant={item.isAvailable ? 'success' : 'secondary'}>
                        {item.isAvailable ? 'Available' : 'Unavailable'}
                      </Badge>
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {categories && categories.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Categories</h2>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <div key={cat.id} className="flex items-center gap-2 rounded-full bg-muted px-3 py-1.5">
                  <span className="text-sm font-medium">{cat.name}</span>
                  <button onClick={() => setDeleteTarget({ type: 'category', id: cat.id, name: cat.name })}>
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Modal isOpen={categoryModalOpen} onClose={() => setCategoryModalOpen(false)} title="New Category">
        <form onSubmit={categoryForm.handleSubmit((data) => createCategory.mutate(data))} className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input {...categoryForm.register('name')} placeholder="e.g. Starters" />
            {categoryForm.formState.errors.name && (
              <p className="mt-1 text-xs text-destructive">{categoryForm.formState.errors.name.message}</p>
            )}
          </div>
          <Button type="submit" className="w-full" isLoading={createCategory.isPending}>
            Create Category
          </Button>
        </form>
      </Modal>

      <Modal
        isOpen={itemModalOpen}
        onClose={() => setItemModalOpen(false)}
        title={editingItem ? 'Edit Menu Item' : 'New Menu Item'}
      >
        <form onSubmit={itemForm.handleSubmit((data) => saveItem.mutate(data))} className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input {...itemForm.register('name')} placeholder="e.g. Jollof Rice" />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea {...itemForm.register('description')} placeholder="Optional" />
          </div>
          <div>
            <Label>Price (NGN)</Label>
            <Input type="number" step="0.01" {...itemForm.register('price', { valueAsNumber: true })} />
          </div>
          <div>
            <Label>Category</Label>
            <Select {...itemForm.register('categoryId')}>
              <option value="">No category</option>
              {categories?.map((cat: MenuCategory) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </Select>
          </div>
          <Button type="submit" className="w-full" isLoading={saveItem.isPending}>
            {editingItem ? 'Save Changes' : 'Create Item'}
          </Button>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return
          if (deleteTarget.type === 'category') deleteCategory.mutate(deleteTarget.id)
          else deleteItem.mutate(deleteTarget.id)
        }}
        title={`Delete "${deleteTarget?.name}"?`}
        description="This cannot be undone."
        confirmText="Delete"
        isDangerous
        isLoading={deleteCategory.isPending || deleteItem.isPending}
      />
    </div>
  )
}
