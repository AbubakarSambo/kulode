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
import apiClient from '@/api/client'
import type { ApiResponse } from '@/types'

interface Category {
  id: string
  name: string
  description?: string
  isActive: boolean
}

const categoriesApi = {
  list: async (): Promise<Category[]> => {
    const response = await apiClient.get<ApiResponse<Category[]>>('/expense-categories')
    return response.data.data
  },
  create: async (data: CategoryFormData): Promise<Category> => {
    const response = await apiClient.post<ApiResponse<Category>>('/expense-categories', data)
    return response.data.data
  },
  update: async (id: string, data: CategoryFormData): Promise<Category> => {
    const response = await apiClient.patch<ApiResponse<Category>>(`/expense-categories/${id}`, data)
    return response.data.data
  },
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/expense-categories/${id}`)
  },
}

const categorySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
})

type CategoryFormData = z.infer<typeof categorySchema>

export function CategoriesPage() {
  const queryClient = useQueryClient()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)

  const { data: categories, isLoading } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => categoriesApi.list(),
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CategoryFormData>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: '',
      description: '',
    },
  })

  const createMutation = useMutation({
    mutationFn: (data: CategoryFormData) => categoriesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] })
      toast.success('Category created')
      closeModal()
    },
    onError: (error: any) => {
      toast.error('Failed to create category', {
        description: error.response?.data?.message,
      })
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: CategoryFormData) => categoriesApi.update(editingCategory!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] })
      toast.success('Category updated')
      closeModal()
    },
    onError: (error: any) => {
      toast.error('Failed to update category', {
        description: error.response?.data?.message,
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => categoriesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] })
      toast.success('Category deleted')
    },
    onError: (error: any) => {
      toast.error('Failed to delete category', {
        description: error.response?.data?.message,
      })
    },
  })

  const openCreateModal = () => {
    setEditingCategory(null)
    reset({ name: '', description: '' })
    setIsModalOpen(true)
  }

  const openEditModal = (category: Category) => {
    setEditingCategory(category)
    reset({ name: category.name, description: category.description || '' })
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingCategory(null)
    reset({ name: '', description: '' })
  }

  const onSubmit = (data: CategoryFormData) => {
    if (editingCategory) {
      updateMutation.mutate(data)
    } else {
      createMutation.mutate(data)
    }
  }

  const handleDelete = (category: Category) => {
    if (window.confirm(`Delete "${category.name}"? Expenses using this category won't be deleted.`)) {
      deleteMutation.mutate(category.id)
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="Expense Categories"
        description="Manage categories for organizing expenses"
        action={
          <Button onClick={openCreateModal}>
            <Plus className="mr-2 h-4 w-4" />
            Add Category
          </Button>
        }
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : categories && categories.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => (
              <Card key={category.id}>
                <CardContent className="flex items-start justify-between p-4">
                  <div className="flex-1">
                    <h3 className="font-medium">{category.name}</h3>
                    {category.description && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {category.description}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditModal(category)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(category)}
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
              <p className="text-muted-foreground">No categories yet</p>
              <Button className="mt-4" onClick={openCreateModal}>
                Add your first category
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingCategory ? 'Edit Category' : 'New Category'}
        description={editingCategory ? 'Update the category details' : 'Create a new expense category'}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name" required>Name</Label>
            <Input
              id="name"
              placeholder="e.g., Office Supplies"
              {...register('name')}
              error={errors.name?.message}
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
              {editingCategory ? 'Save Changes' : 'Create Category'}
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
