import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Upload } from 'lucide-react'
import { ChefHatIcon } from '@hugeicons/core-free-icons'
import { Header } from '@/components/layout'
import { Button, Input, Label, Textarea, Card, CardContent, Badge, ConfirmDialog, EmptyState } from '@/components/ui'
import { Modal } from '@/components/shared/Modal'
import { CsvImportModal, type CsvColumn } from '@/components/shared/CsvImportModal'
import { menuCategoriesApi, menuItemsApi } from '@/api'
import { formatCurrency, cn } from '@/lib/utils'
import type { MenuItem } from '@/types'
import { InventoryIcon } from '@/components/ui/CustomIcons'

const itemSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  price: z.number().min(0, 'Price must be 0 or greater'),
  categoryIds: z.array(z.string()),
})

type ItemFormData = z.infer<typeof itemSchema>

const CSV_COLUMNS: CsvColumn[] = [
  { key: 'name', label: 'Name', required: true },
  { key: 'description', label: 'Description' },
  { key: 'price', label: 'Price', required: true },
  { key: 'categories', label: 'Categories' },
]
const CSV_SAMPLE_ROWS = [
  ['Name', 'Description', 'Price', 'Categories'],
  ['Jollof Rice', 'Smoky party jollof with fried plantain', '2500', 'Mains'],
  ['Chapman', '', '1500', 'Drinks'],
  ['Suya Wrap', 'Grilled beef skewer, wrapped', '1800', 'Starters;Mains'],
]

export function MenuManagementPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [itemModalOpen, setItemModalOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  const { data: categories, isLoading: categoriesLoading } = useQuery({
    queryKey: ['menu-categories'],
    queryFn: () => menuCategoriesApi.list(),
  })

  const { data: items, isLoading: itemsLoading } = useQuery({
    queryKey: ['menu-items'],
    queryFn: () => menuItemsApi.list(),
  })

  const itemForm = useForm<ItemFormData>({ resolver: zodResolver(itemSchema) })
  const selectedCategoryIds = itemForm.watch('categoryIds') ?? []

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
    itemForm.reset({ name: '', description: '', price: undefined, categoryIds: [] })
    setItemModalOpen(true)
  }

  const openEditItem = (item: MenuItem) => {
    setEditingItem(item)
    itemForm.reset({
      name: item.name,
      description: item.description,
      price: item.price,
      categoryIds: item.categories.map((c) => c.id),
    })
    setItemModalOpen(true)
  }

  const toggleCategory = (categoryId: string) => {
    const current = itemForm.getValues('categoryIds')
    itemForm.setValue(
      'categoryIds',
      current.includes(categoryId) ? current.filter((id) => id !== categoryId) : [...current, categoryId],
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header
        title="Menu"
        description="Manage menu items for your restaurant"
        icon={InventoryIcon}
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="mr-1.5 h-4 w-4" /> Import CSV
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
              <Card
                key={item.id}
                onClick={() => navigate(`/pos/menu/${item.id}`)}
                className="flex h-full cursor-pointer flex-col p-4"
              >
                <CardContent className="flex h-full flex-col p-0">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-foreground">{item.name}</h3>
                      {item.categories.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {item.categories.map((cat) => (
                            <Badge key={cat.id} variant="secondary">{cat.name}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          openEditItem(item)
                        }}
                        className="rounded-lg p-2 hover:bg-muted"
                      >
                        <Pencil className="h-4 w-4 text-muted-foreground" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeleteTarget({ id: item.id, name: item.name })
                        }}
                        className="rounded-lg p-2 hover:bg-muted"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </button>
                    </div>
                  </div>
                  {item.description && <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>}
                  <div className="mt-auto flex items-center justify-between pt-3">
                    <span className="text-lg font-bold text-foreground">{formatCurrency(item.price)}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleAvailability.mutate({ id: item.id, isAvailable: !item.isAvailable })
                      }}
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
      </div>

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
            <Input type="number" step="0.01" placeholder="0.00" {...itemForm.register('price', { valueAsNumber: true })} />
          </div>
          <div>
            <Label>Categories</Label>
            {categories && categories.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => {
                  const selected = selectedCategoryIds.includes(cat.id)
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => toggleCategory(cat.id)}
                      className={cn(
                        'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                        selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {cat.name}
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No categories yet — add one from the Categories page.</p>
            )}
          </div>
          <Button type="submit" className="w-full" isLoading={saveItem.isPending}>
            {editingItem ? 'Save Changes' : 'Create Item'}
          </Button>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteItem.mutate(deleteTarget.id)}
        title={`Delete "${deleteTarget?.name}"?`}
        description="This cannot be undone."
        confirmText="Delete"
        isDangerous
        isLoading={deleteItem.isPending}
      />

      <CsvImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import Menu Items"
        columns={CSV_COLUMNS}
        sampleFilename="menu-items-sample.csv"
        sampleRows={CSV_SAMPLE_ROWS}
        onImportRow={async (row) => {
          const price = Number(row.price)
          if (Number.isNaN(price)) throw new Error(`Invalid price "${row.price}"`)

          const categoryNames = row.categories
            .split(';')
            .map((n) => n.trim())
            .filter(Boolean)
          const categoryIds = categoryNames.map((wantedName) => {
            const match = categories?.find((c) => c.name.toLowerCase() === wantedName.toLowerCase())
            if (!match) throw new Error(`Unknown category "${wantedName}" — create it first`)
            return match.id
          })

          await menuItemsApi.create({
            name: row.name,
            description: row.description || undefined,
            price,
            categoryIds,
          })
        }}
        onImported={() => queryClient.invalidateQueries({ queryKey: ['menu-items'] })}
      />
    </div>
  )
}
