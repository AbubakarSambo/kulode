import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Header } from '@/components/layout'
import { Button, Input, Label, Textarea, Select, Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { expensesApi } from '@/api'
import { posthog } from '@/lib/posthog'
import type { PaymentMethod } from '@/types'

const expenseSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  amount: z.number().min(0.01, 'Amount must be greater than 0'),
  expenseDate: z.string().min(1, 'Date is required'),
  categoryId: z.string().optional(),
  recipient: z.string().optional(),
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'CARD', 'OTHER']),
  reference: z.string().optional(),
  notes: z.string().optional(),
})

type ExpenseFormData = z.infer<typeof expenseSchema>

export function NewExpensePage() {
  return <ExpenseForm />
}

export function EditExpensePage() {
  const { id } = useParams<{ id: string }>()
  return <ExpenseForm expenseId={id} />
}

function ExpenseForm({ expenseId }: { expenseId?: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isEditing = !!expenseId

  const { data: categories } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => expensesApi.listCategories(),
  })

  const { data: expense, isLoading: isLoadingExpense } = useQuery({
    queryKey: ['expenses', expenseId],
    queryFn: () => expensesApi.get(expenseId!),
    enabled: isEditing,
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      description: '',
      amount: 0,
      expenseDate: new Date().toISOString().split('T')[0],
      categoryId: '',
      recipient: '',
      paymentMethod: 'CASH',
      reference: '',
      notes: '',
    },
  })

  useEffect(() => {
    if (expense) {
      reset({
        description: expense.description,
        amount: expense.amount,
        expenseDate: new Date(expense.expenseDate).toISOString().split('T')[0],
        categoryId: expense.category?.id ?? '',
        recipient: expense.recipient ?? '',
        paymentMethod: expense.paymentMethod as ExpenseFormData['paymentMethod'],
        reference: expense.reference ?? '',
        notes: expense.notes ?? '',
      })
    }
  }, [expense, reset])

  const createMutation = useMutation({
    mutationFn: (data: ExpenseFormData) => expensesApi.create({
      ...data,
      amount: Number(data.amount),
      categoryId: data.categoryId || undefined,
      paymentMethod: data.paymentMethod as PaymentMethod,
    }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      posthog.capture('expense_recorded', { payment_method: variables.paymentMethod })
      toast.success('Expense recorded')
      navigate('/expenses')
    },
    onError: (error: any) => {
      toast.error('Failed to record expense', {
        description: error.response?.data?.message || 'Please try again',
      })
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: ExpenseFormData) => expensesApi.update(expenseId!, {
      ...data,
      amount: Number(data.amount),
      categoryId: data.categoryId || undefined,
      paymentMethod: data.paymentMethod as PaymentMethod,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      toast.success('Expense updated')
      navigate('/expenses')
    },
    onError: (error: any) => {
      toast.error('Failed to update expense', {
        description: error.response?.data?.message || 'Please try again',
      })
    },
  })

  const onSubmit = (data: ExpenseFormData) => {
    if (isEditing) {
      updateMutation.mutate(data)
    } else {
      createMutation.mutate(data)
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  if (isEditing && isLoadingExpense) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title={isEditing ? 'Edit Expense' : 'New Expense'}
        description={isEditing ? 'Update expense details' : 'Record a business expense'}
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <Card className="mx-auto max-w-2xl">
          <CardHeader>
            <CardTitle>Expense Details</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="description" required>Description</Label>
                <Input
                  id="description"
                  placeholder="What was this expense for?"
                  {...register('description')}
                  error={errors.description?.message}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="amount" required>Amount</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    {...register('amount', { valueAsNumber: true })}
                    error={errors.amount?.message}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expenseDate" required>Date</Label>
                  <Input
                    id="expenseDate"
                    type="date"
                    {...register('expenseDate')}
                    error={errors.expenseDate?.message}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="categoryId">Category</Label>
                  <Select
                    id="categoryId"
                    {...register('categoryId')}
                  >
                    <option value="">Select category</option>
                    {categories?.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="paymentMethod" required>Payment Method</Label>
                  <Select
                    id="paymentMethod"
                    {...register('paymentMethod')}
                    error={errors.paymentMethod?.message}
                  >
                    <option value="CASH">Cash</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="CARD">Card</option>
                    <option value="OTHER">Other</option>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="recipient">Paid To</Label>
                  <Input
                    id="recipient"
                    placeholder="Vendor or recipient name"
                    {...register('recipient')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reference">Reference</Label>
                  <Input
                    id="reference"
                    placeholder="Receipt or transaction number"
                    {...register('reference')}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Additional notes..."
                  {...register('notes')}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <Button type="submit" isLoading={isPending}>
                  {isEditing ? 'Update Expense' : 'Record Expense'}
                </Button>
                <Button type="button" variant="outline" onClick={() => navigate(-1)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
