import { useEffect, useState, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Search } from 'lucide-react'
import { Header } from '@/components/layout'
import { Button, Input, Label, Textarea, Select, Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { expensesApi, vendorsApi } from '@/api'
import { posthog } from '@/lib/posthog'
import type { PaymentMethod, Vendor } from '@/types'

// VendorCombobox: lets user pick a saved vendor or type free text
function VendorCombobox({
  vendors,
  vendorId,
  inputValue,
  onChange,
}: {
  vendors: Vendor[]
  vendorId: string | null
  inputValue: string
  onChange: (value: { vendorId?: string; recipient: string }) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(inputValue)
  const ref = useRef<HTMLDivElement>(null)

  // Keep query in sync with external inputValue (e.g. when editing loads data)
  useEffect(() => {
    setQuery(inputValue)
  }, [inputValue])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filtered = vendors.filter((v) =>
    v.name.toLowerCase().includes(query.toLowerCase()),
  )

  const selectedVendor = vendorId ? vendors.find((v) => v.id === vendorId) : null

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const text = e.target.value
    setQuery(text)
    setOpen(true)
    // User is typing free text — clear any previously selected vendor
    onChange({ vendorId: undefined, recipient: text })
  }

  function handleSelectVendor(vendor: Vendor) {
    setQuery(vendor.name)
    setOpen(false)
    onChange({ vendorId: vendor.id, recipient: vendor.name })
  }

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center rounded-md border border-input bg-background shadow-sm focus-within:ring-1 focus-within:ring-ring">
        <Search className="ml-3 h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => setOpen(true)}
          placeholder="Vendor or recipient name"
          className="flex h-9 w-full bg-transparent px-3 py-1 text-sm outline-none placeholder:text-muted-foreground"
        />
        {selectedVendor && (
          <span className="mr-3 shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            vendor
          </span>
        )}
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-card shadow-lg">
          <div className="max-h-48 overflow-y-auto p-1">
            {filtered.map((vendor) => (
              <button
                key={vendor.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelectVendor(vendor)}
                className="flex w-full flex-col rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              >
                <span className="font-medium">{vendor.name}</span>
                {vendor.serviceDescription && (
                  <span className="text-xs text-muted-foreground">{vendor.serviceDescription}</span>
                )}
              </button>
            ))}
            {filtered.length === 0 && query && (
              <p className="px-2 py-3 text-center text-sm text-muted-foreground">
                No vendors found — will save as free text
              </p>
            )}
            {filtered.length === 0 && !query && (
              <p className="px-2 py-3 text-center text-sm text-muted-foreground">
                No vendors yet
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const expenseSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  amount: z.number().min(0.01, 'Amount must be greater than 0'),
  expenseDate: z.string().min(1, 'Date is required'),
  categoryId: z.string().optional(),
  vendorId: z.string().optional(),
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

  const { data: vendorsPage } = useQuery({
    queryKey: ['vendors', { limit: 100 }],
    queryFn: () => vendorsApi.list({ limit: 100 }),
  })

  const vendors = vendorsPage?.data ?? []

  const { data: expense, isLoading: isLoadingExpense } = useQuery({
    queryKey: ['expenses', expenseId],
    queryFn: () => expensesApi.get(expenseId!),
    enabled: isEditing,
  })

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      description: '',
      amount: 0,
      expenseDate: new Date().toISOString().split('T')[0],
      categoryId: '',
      vendorId: undefined,
      recipient: '',
      paymentMethod: 'CASH',
      reference: '',
      notes: '',
    },
  })

  const vendorId = watch('vendorId')
  const recipient = watch('recipient') ?? ''

  useEffect(() => {
    if (expense) {
      reset({
        description: expense.description,
        amount: expense.amount,
        expenseDate: new Date(expense.expenseDate).toISOString().split('T')[0],
        categoryId: expense.category?.id ?? '',
        vendorId: expense.vendorId ?? undefined,
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
      vendorId: data.vendorId || undefined,
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
      vendorId: data.vendorId || undefined,
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
                  <Label>Paid To</Label>
                  <VendorCombobox
                    vendors={vendors}
                    vendorId={vendorId ?? null}
                    inputValue={recipient}
                    onChange={({ vendorId: vid, recipient: rec }) => {
                      setValue('vendorId', vid)
                      setValue('recipient', rec)
                    }}
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
