import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { ArrowLeft, Pencil, Trash2, Plus, CookingPot } from 'lucide-react'
import { Header } from '@/components/layout'
import { Button, Input, Label, Textarea, Card, CardContent, Badge, ConfirmDialog, SearchableSelect } from '@/components/ui'
import { Modal } from '@/components/shared/Modal'
import { menuCategoriesApi, menuItemsApi, inventoryApi } from '@/api'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth'
import type { UnitOfMeasure } from '@/types'

// Matches InventoryPage's UNIT_SUFFIX — kept in sync manually since it's a tiny, stable lookup.
const UNIT_SUFFIX: Record<UnitOfMeasure, string> = { KG: 'kg', G: 'g', L: 'L', ML: 'ml', UNIT: 'unit(s)' }

const itemSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  price: z.number().min(0, 'Price must be 0 or greater'),
  categoryIds: z.array(z.string()),
  durationMinutes: z.number({ error: 'Prep time is required' }).min(0, 'Duration must be 0 or greater'),
})
type ItemFormData = z.infer<typeof itemSchema>

const recipeSchema = z.object({
  ingredients: z.array(
    z.object({
      inventoryItemId: z.string().min(1, 'Choose an ingredient'),
      quantityPerUnit: z.number().min(0.001, 'Must be greater than 0'),
    }),
  ),
})
type RecipeFormData = z.infer<typeof recipeSchema>

function errorMessage(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback
}

export function MenuItemDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [recipeOpen, setRecipeOpen] = useState(false)
  const user = useAuthStore((s) => s.user)
  // Cashiers can add menu items but not edit/delete existing ones — admin-only on the backend
  // too, so hide those controls here rather than let the request 403.
  const canManage = !!user?.roles.some((r) => r === 'SUPER_ADMIN' || r === 'ADMIN')

  const { data: item, isLoading } = useQuery({
    queryKey: ['menu-items', id],
    queryFn: () => menuItemsApi.get(id!),
    enabled: !!id,
  })

  const { data: history } = useQuery({
    queryKey: ['menu-items', id, 'history'],
    queryFn: () => menuItemsApi.getHistory(id!),
    enabled: !!id,
  })

  const { data: categories } = useQuery({
    queryKey: ['menu-categories'],
    queryFn: () => menuCategoriesApi.list(),
    enabled: editOpen,
  })

  const { data: inventoryItems } = useQuery({
    queryKey: ['inventory-items'],
    queryFn: () => inventoryApi.list(),
    enabled: recipeOpen,
  })

  const form = useForm<ItemFormData>({ resolver: zodResolver(itemSchema) })
  const selectedCategoryIds = form.watch('categoryIds') ?? []

  const toggleCategory = (categoryId: string) => {
    const current = form.getValues('categoryIds')
    form.setValue(
      'categoryIds',
      current.includes(categoryId) ? current.filter((c) => c !== categoryId) : [...current, categoryId],
    )
  }

  const recipeForm = useForm<RecipeFormData>({ resolver: zodResolver(recipeSchema), defaultValues: { ingredients: [] } })
  const { fields: recipeFields, append: appendIngredient, remove: removeIngredient } = useFieldArray({
    control: recipeForm.control,
    name: 'ingredients',
  })
  const watchedIngredients = recipeForm.watch('ingredients')

  const updateItem = useMutation({
    mutationFn: (data: ItemFormData) => menuItemsApi.update(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-items', id] })
      queryClient.invalidateQueries({ queryKey: ['menu-items'] })
      toast.success('Item updated')
      setEditOpen(false)
    },
    onError: (err: unknown) => toast.error(errorMessage(err, 'Failed to update item')),
  })

  const saveRecipe = useMutation({
    mutationFn: (data: RecipeFormData) => menuItemsApi.setIngredients(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-items', id] })
      queryClient.invalidateQueries({ queryKey: ['menu-items'] })
      toast.success('Recipe updated')
      setRecipeOpen(false)
    },
    onError: (err: unknown) => toast.error(errorMessage(err, 'Failed to update recipe')),
  })

  const deleteItem = useMutation({
    mutationFn: () => menuItemsApi.delete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-items'] })
      toast.success('Item deleted')
      navigate('/pos/menu')
    },
    onError: (err: unknown) => toast.error(errorMessage(err, 'Failed to delete item')),
  })

  if (isLoading || !item) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header
        title={item.name}
        description={formatCurrency(item.price)}
        action={
          <Button variant="ghost" size="sm" onClick={() => navigate('/pos/menu')}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-4 md:col-span-1">
            <CardContent className="space-y-3 p-0">
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-foreground">{item.name}</span>
                <Badge variant={item.isAvailable ? 'success' : 'secondary'}>
                  {item.isAvailable ? 'Available' : 'Unavailable'}
                </Badge>
              </div>
              {item.categories.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {item.categories.map((cat) => (
                    <Badge key={cat.id} variant="secondary">{cat.name}</Badge>
                  ))}
                </div>
              )}
              {item.description && (
                <div className="space-y-1 text-sm">
                  <div className="text-muted-foreground">Description</div>
                  <div className="font-medium text-foreground">{item.description}</div>
                </div>
              )}
              <div className="space-y-1 text-sm">
                <div className="text-muted-foreground">Price</div>
                <div className="font-medium text-foreground">{formatCurrency(item.price)}</div>
              </div>
              {item.durationMinutes != null && (
                <div className="space-y-1 text-sm">
                  <div className="text-muted-foreground">Prep time</div>
                  <div className="font-medium text-foreground">{item.durationMinutes} min</div>
                </div>
              )}

              {canManage && (
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      form.reset({
                        name: item.name,
                        description: item.description,
                        price: item.price,
                        categoryIds: item.categories.map((c) => c.id),
                        durationMinutes: item.durationMinutes,
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
              )}
            </CardContent>
          </Card>

          <div className="space-y-4 md:col-span-2">
            <div className="grid grid-cols-3 gap-4">
              <Card className="p-4">
                <CardContent className="p-0">
                  <div className="text-xs text-muted-foreground">Times Ordered</div>
                  <div className="text-2xl font-bold text-foreground">{history?.stats.timesOrdered ?? '—'}</div>
                </CardContent>
              </Card>
              <Card className="p-4">
                <CardContent className="p-0">
                  <div className="text-xs text-muted-foreground">Revenue</div>
                  <div className="text-2xl font-bold text-foreground">
                    {history ? formatCurrency(history.stats.totalRevenue) : '—'}
                  </div>
                </CardContent>
              </Card>
              <Card className="p-4">
                <CardContent className="p-0">
                  <div className="text-xs text-muted-foreground">Last Ordered</div>
                  <div className="text-2xl font-bold text-foreground">
                    {history?.stats.lastOrderedAt ? formatDate(history.stats.lastOrderedAt) : 'Never'}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="p-4">
              <CardContent className="p-0">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 font-semibold text-foreground">
                    <CookingPot className="h-4 w-4 text-muted-foreground" /> Recipe
                  </h3>
                  {canManage && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        recipeForm.reset({
                          ingredients: item.ingredients.map((line) => ({
                            inventoryItemId: line.inventoryItemId,
                            quantityPerUnit: line.quantityPerUnit,
                          })),
                        })
                        setRecipeOpen(true)
                      }}
                    >
                      <Pencil className="mr-1.5 h-4 w-4" /> {item.ingredients.length > 0 ? 'Edit Recipe' : 'Add Recipe'}
                    </Button>
                  )}
                </div>
                {item.ingredients.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No recipe set — stock won't deplete when this item is served.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {item.ingredients.map((line) => (
                      <div
                        key={line.inventoryItemId}
                        className="flex items-center justify-between rounded-xl border border-border p-3"
                      >
                        <div>
                          <div className="text-sm font-semibold text-foreground">{line.name}</div>
                          {line.sku && <div className="text-xs text-muted-foreground">SKU {line.sku}</div>}
                        </div>
                        <span className="text-sm font-semibold text-foreground">
                          {line.quantityPerUnit} {UNIT_SUFFIX[line.unitOfMeasure]} / order
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="p-4">
              <CardContent className="p-0">
                <h3 className="mb-3 font-semibold text-foreground">Recent Orders</h3>
                {!history || history.recentOrders.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">Never ordered yet</p>
                ) : (
                  <div className="space-y-2">
                    {history.recentOrders.map((entry) => (
                      <div
                        key={entry.id}
                        onClick={() => navigate(`/pos/orders/${entry.order.id}`)}
                        className="flex cursor-pointer items-center justify-between rounded-xl border border-border p-3 hover:bg-muted/40"
                      >
                        <div>
                          <div className="text-sm font-semibold text-foreground">
                            Order #{entry.order.id.slice(0, 8).toUpperCase()}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {entry.quantity}x · {entry.order.source.replace('_', ' ')} · {formatDate(entry.createdAt)}
                            {entry.order.waiter && ` · ${entry.order.waiter.firstName} ${entry.order.waiter.lastName}`}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge
                            variant={
                              entry.order.status === 'CLOSED_PAID'
                                ? 'success'
                                : entry.order.status === 'CANCELLED'
                                  ? 'destructive'
                                  : 'default'
                            }
                          >
                            {entry.order.status.replace('_', ' ')}
                          </Badge>
                          <span className="text-sm font-semibold text-foreground">{formatCurrency(entry.amount)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Modal isOpen={editOpen} onClose={() => setEditOpen(false)} title="Edit Menu Item">
        <form onSubmit={form.handleSubmit((data) => updateItem.mutate(data))} className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input {...form.register('name')} />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea {...form.register('description')} placeholder="Optional" />
          </div>
          <div>
            <Label>Price (NGN)</Label>
            <Input type="number" step="0.01" {...form.register('price', { valueAsNumber: true })} />
          </div>
          <div>
            <Label>Prep time (minutes)</Label>
            <Input
              type="number"
              step="1"
              placeholder="Drives the kitchen ticket countdown"
              error={form.formState.errors.durationMinutes?.message}
              {...form.register('durationMinutes', { valueAsNumber: true })}
            />
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
              <p className="text-sm text-muted-foreground">No categories yet.</p>
            )}
          </div>
          <Button type="submit" className="w-full" isLoading={updateItem.isPending}>
            Save Changes
          </Button>
        </form>
      </Modal>

      <Modal isOpen={recipeOpen} onClose={() => setRecipeOpen(false)} title="Edit Recipe">
        <form onSubmit={recipeForm.handleSubmit((data) => saveRecipe.mutate(data))} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Each line is consumed from inventory the moment this item is marked <strong>Served</strong> on the
            kitchen board.
          </p>

          <div className="space-y-3">
            {recipeFields.length === 0 && (
              <p className="text-sm text-muted-foreground">No ingredients yet — add one below.</p>
            )}
            {recipeFields.map((field, index) => {
              const chosenElsewhere = new Set(
                watchedIngredients?.filter((_, i) => i !== index).map((line) => line.inventoryItemId),
              )
              const options = (inventoryItems ?? [])
                .filter((inv) => inv.id === watchedIngredients?.[index]?.inventoryItemId || !chosenElsewhere.has(inv.id))
                .map((inv) => ({ id: inv.id, label: inv.sku ? `${inv.name} · ${inv.sku}` : inv.name }))
              // Recipe quantities have no cross-unit conversion — they're always in whatever unit
              // the chosen ingredient is stocked in, so show that unit right next to the input.
              const selectedUnit = inventoryItems?.find(
                (inv) => inv.id === watchedIngredients?.[index]?.inventoryItemId,
              )?.unitOfMeasure

              return (
                <div key={field.id} className="flex items-start gap-2">
                  <div className="flex-1">
                    <Label>Ingredient</Label>
                    <SearchableSelect
                      options={options}
                      value={recipeForm.watch(`ingredients.${index}.inventoryItemId`) ?? ''}
                      onChange={(value) => recipeForm.setValue(`ingredients.${index}.inventoryItemId`, value, { shouldValidate: true })}
                      placeholder="Select inventory item"
                      error={recipeForm.formState.errors.ingredients?.[index]?.inventoryItemId?.message}
                    />
                  </div>
                  <div className="w-28">
                    <Label>Qty / order{selectedUnit ? ` (${UNIT_SUFFIX[selectedUnit]})` : ''}</Label>
                    <Input
                      type="number"
                      step="0.001"
                      min="0"
                      error={recipeForm.formState.errors.ingredients?.[index]?.quantityPerUnit?.message}
                      {...recipeForm.register(`ingredients.${index}.quantityPerUnit`, { valueAsNumber: true })}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="mt-6 text-destructive"
                    onClick={() => removeIngredient(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )
            })}
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => appendIngredient({ inventoryItemId: '', quantityPerUnit: 1 })}
          >
            <Plus className="mr-1.5 h-4 w-4" /> Add Ingredient
          </Button>

          <Button type="submit" className="w-full" isLoading={saveRecipe.isPending}>
            Save Recipe
          </Button>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => deleteItem.mutate()}
        title={`Delete "${item.name}"?`}
        description="This cannot be undone, even if it has past orders."
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous
        isLoading={deleteItem.isPending}
      />
    </div>
  )
}
