import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Tag, Upload, LayoutGrid, List } from 'lucide-react'
import { Tag01Icon } from '@hugeicons/core-free-icons'
import { Header } from '@/components/layout'
import { Button, Input, Label, Card, CardContent, Badge, ConfirmDialog, EmptyState } from '@/components/ui'
import { Modal } from '@/components/shared/Modal'
import { CsvImportModal, type CsvColumn } from '@/components/shared/CsvImportModal'
import { menuCategoriesApi } from '@/api'
import { cn } from '@/lib/utils'
import type { MenuCategory } from '@/types'
import { useAuthStore } from '@/stores/auth'

const CSV_COLUMNS: CsvColumn[] = [
  { key: 'name', label: 'Name', required: true },
  { key: 'sortOrder', label: 'Sort Order' },
]
const CSV_SAMPLE_ROWS = [
  ['Name', 'Sort Order'],
  ['Starters', '1'],
  ['Mains', '2'],
  ['Drinks', '3'],
]

const categorySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  sortOrder: z.number().optional(),
})

type CategoryFormData = z.infer<typeof categorySchema>

export function MenuCategoriesPage() {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  // Cashiers can add categories but not edit/delete existing ones — admin-only on the backend
  // too, so hide those controls here rather than let the request 403.
  const canManage = !!user?.roles.some((r) => r === 'SUPER_ADMIN' || r === 'ADMIN')

  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<MenuCategory | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  const { data: categories, isLoading } = useQuery({
    queryKey: ['menu-categories'],
    queryFn: () => menuCategoriesApi.list(),
  })

  const categoryForm = useForm<CategoryFormData>({ resolver: zodResolver(categorySchema) })

  const saveCategory = useMutation({
    mutationFn: (data: CategoryFormData) =>
      editingCategory ? menuCategoriesApi.update(editingCategory.id, data) : menuCategoriesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-categories'] })
      toast.success(editingCategory ? 'Category updated' : 'Category created')
      setCategoryModalOpen(false)
      setEditingCategory(null)
      categoryForm.reset()
    },
    onError: () => toast.error('Failed to save category'),
  })

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => menuCategoriesApi.update(id, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['menu-categories'] }),
    onError: () => toast.error('Failed to update category'),
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

  const bulkDelete = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(ids.map((id) => menuCategoriesApi.delete(id)))
      return results
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ['menu-categories'] })
      const failed = results.filter((r) => r.status === 'rejected').length
      const succeeded = results.length - failed
      if (failed === 0) {
        toast.success(`${succeeded} categor${succeeded === 1 ? 'y' : 'ies'} deleted`)
      } else {
        toast.error(`${succeeded} deleted, ${failed} failed`)
      }
      setSelectedIds(new Set())
      setBulkDeleteOpen(false)
    },
    onError: () => toast.error('Failed to delete categories'),
  })

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allSelected = !!categories?.length && selectedIds.size === categories.length
  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(categories?.map((c) => c.id)))
  }

  const openNewCategory = () => {
    setEditingCategory(null)
    categoryForm.reset({ name: '', sortOrder: (categories?.length ?? 0) + 1 })
    setCategoryModalOpen(true)
  }

  const openEditCategory = (category: MenuCategory) => {
    setEditingCategory(category)
    categoryForm.reset({ name: category.name, sortOrder: category.sortOrder })
    setCategoryModalOpen(true)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header
        title="Categories"
        description="Organize your menu items into categories"
        icon={Tag}
        action={
          <div className="flex gap-2">
            <div className="flex items-center rounded-lg border border-border p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                aria-label="Grid view"
                className={cn('rounded-md p-1.5', viewMode === 'grid' ? 'bg-muted text-foreground' : 'text-muted-foreground')}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                aria-label="List view"
                className={cn('rounded-md p-1.5', viewMode === 'list' ? 'bg-muted text-foreground' : 'text-muted-foreground')}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="mr-1.5 h-4 w-4" /> Import CSV
            </Button>
            <Button size="sm" onClick={openNewCategory}>
              <Plus className="mr-1.5 h-4 w-4" /> Category
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {canManage && !!categories?.length && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-border bg-muted/50 px-4 py-2.5">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
            </label>
            {selectedIds.size > 0 && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelectedIds(new Set())}>
                  Cancel
                </Button>
                <Button variant="outline" size="sm" onClick={() => setBulkDeleteOpen(true)}>
                  <Trash2 className="mr-1.5 h-4 w-4 text-destructive" /> Delete Selected
                </Button>
              </div>
            )}
          </div>
        )}
        {!isLoading && (!categories || categories.length === 0) ? (
          <EmptyState
            icon={Tag01Icon}
            title="No categories yet"
            description="Add your first category to start organizing your menu"
            actionLabel="Add Category"
            onAction={openNewCategory}
          />
        ) : viewMode === 'list' ? (
          <Card className="overflow-hidden p-0">
            <CardContent className="divide-y divide-border p-0">
              {categories
                ?.slice()
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((category) => (
                  <div key={category.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
                    {canManage && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(category.id)}
                        onChange={() => toggleSelected(category.id)}
                        className="h-4 w-4 shrink-0 rounded border-border accent-primary"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-semibold text-foreground">{category.name}</h3>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">Order: {category.sortOrder}</span>
                    {canManage ? (
                      <button
                        onClick={() => toggleActive.mutate({ id: category.id, isActive: !category.isActive })}
                        className="shrink-0"
                      >
                        <Badge variant={category.isActive ? 'success' : 'secondary'}>
                          {category.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </button>
                    ) : (
                      <Badge variant={category.isActive ? 'success' : 'secondary'} className="shrink-0">
                        {category.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    )}
                    {canManage && (
                      <div className="flex shrink-0 items-center gap-1">
                        <button onClick={() => openEditCategory(category)} className="rounded-lg p-2 hover:bg-muted">
                          <Pencil className="h-4 w-4 text-muted-foreground" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget({ id: category.id, name: category.name })}
                          className="rounded-lg p-2 hover:bg-muted"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories
              ?.slice()
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((category) => (
                <Card key={category.id} className="p-4">
                  <CardContent className="flex items-center justify-between p-0">
                    <div className="flex items-start gap-2">
                      {canManage && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(category.id)}
                          onChange={() => toggleSelected(category.id)}
                          className="mt-1 h-4 w-4 shrink-0 rounded border-border accent-primary"
                        />
                      )}
                      <div>
                        <h3 className="font-semibold text-foreground">{category.name}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">Order: {category.sortOrder}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {canManage ? (
                        <button onClick={() => toggleActive.mutate({ id: category.id, isActive: !category.isActive })}>
                          <Badge variant={category.isActive ? 'success' : 'secondary'}>
                            {category.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </button>
                      ) : (
                        <Badge variant={category.isActive ? 'success' : 'secondary'}>
                          {category.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      )}
                      {canManage && (
                        <>
                          <button onClick={() => openEditCategory(category)} className="rounded-lg p-2 hover:bg-muted">
                            <Pencil className="h-4 w-4 text-muted-foreground" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget({ id: category.id, name: category.name })}
                            className="rounded-lg p-2 hover:bg-muted"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        )}
      </div>

      <Modal
        isOpen={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        title={editingCategory ? 'Edit Category' : 'New Category'}
      >
        <form onSubmit={categoryForm.handleSubmit((data) => saveCategory.mutate(data))} className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input {...categoryForm.register('name')} placeholder="e.g. Starters" />
            {categoryForm.formState.errors.name && (
              <p className="mt-1 text-xs text-destructive">{categoryForm.formState.errors.name.message}</p>
            )}
          </div>
          <div>
            <Label>Sort Order</Label>
            <Input type="number" {...categoryForm.register('sortOrder', { valueAsNumber: true })} />
          </div>
          <Button type="submit" className="w-full" isLoading={saveCategory.isPending}>
            {editingCategory ? 'Save Changes' : 'Create Category'}
          </Button>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteCategory.mutate(deleteTarget.id)}
        title={`Delete "${deleteTarget?.name}"?`}
        description="This cannot be undone."
        confirmText="Delete"
        isDangerous
        isLoading={deleteCategory.isPending}
      />

      <ConfirmDialog
        isOpen={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={() => bulkDelete.mutate(Array.from(selectedIds))}
        title={`Delete ${selectedIds.size} categor${selectedIds.size === 1 ? 'y' : 'ies'}?`}
        description="This cannot be undone."
        confirmText="Delete"
        isDangerous
        isLoading={bulkDelete.isPending}
      />

      <CsvImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import Categories"
        columns={CSV_COLUMNS}
        sampleFilename="menu-categories-sample.csv"
        sampleRows={CSV_SAMPLE_ROWS}
        onImportRow={async (row) => {
          await menuCategoriesApi.create({
            name: row.name,
            sortOrder: row.sortOrder ? Number(row.sortOrder) : undefined,
          })
        }}
        onImported={() => queryClient.invalidateQueries({ queryKey: ['menu-categories'] })}
      />
    </div>
  )
}
