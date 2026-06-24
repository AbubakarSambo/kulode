import { useEffect, useState, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Search, Lock } from 'lucide-react'
import { Header } from '@/components/layout'
import { Button, Input, Label, Textarea, Select, Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { expensesApi, vendorsApi } from '@/api'
import { posthog } from '@/lib/posthog'
import { useSubscription } from '@/hooks/useSubscription'
import type { PaymentMethod, TaxCategory, Vendor } from '@/types'
import { TAX_CATEGORY_LABELS, TAX_CATEGORIES } from '@/types'
import { useOverscrollBounce } from '@/hooks'
import { formatAmountInput, parseAmountInput } from '@/lib/utils'

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
  taxCategory: z.enum(['RENT', 'SALARIES', 'UTILITIES', 'MARKETING', 'TRANSPORT',
    'PROFESSIONAL_FEES', 'LOAN_INTEREST', 'CAPITAL_ASSETS', 'NON_DEDUCTIBLE', 'UNCATEGORIZED']).optional(),
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
  const scrollContainerRef = useOverscrollBounce<HTMLDivElement>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isEditing = !!expenseId
  const { hasRequiredPlan } = useSubscription()
  const isPro = hasRequiredPlan('PRO')

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

  const [amountStr, setAmountStr] = useState('')

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
        taxCategory: expense.taxCategory as ExpenseFormData['taxCategory'],
      })
      setAmountStr(formatAmountInput(expense.amount))
    }
  }, [expense, reset])

  const createMutation = useMutation({
    mutationFn: (data: ExpenseFormData) => expensesApi.create({
      ...data,
      amount: Number(data.amount),
      categoryId: data.categoryId || undefined,
      vendorId: data.vendorId || undefined,
      paymentMethod: data.paymentMethod as PaymentMethod,
      taxCategory: data.taxCategory as TaxCategory | undefined,
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
      taxCategory: data.taxCategory as TaxCategory | undefined,
    }),
    onSuccess: () => {
      posthog.capture('expense_updated', { expense_id: expenseId })
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

      <div ref={scrollContainerRef} className="flex-1 overflow-auto p-4 sm:p-6">
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
                    type="text"
                    placeholder="0.00"
                    value={amountStr}
                    onChange={(e) => {
                      const val = e.target.value
                      const formatted = formatAmountInput(val)
                      setAmountStr(formatted)
                      setValue('amount', parseAmountInput(formatted), { shouldValidate: true })
                    }}
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

              {/* Tax Category — Pro feature */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="taxCategory">Tax Category</Label>
                  {!isPro && (
                    <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                      <Lock className="h-3 w-3" />
                      Pro
                    </span>
                  )}
                </div>
                {isPro ? (
                  <Select id="taxCategory" {...register('taxCategory')}>
                    <option value="">Select tax category</option>
                    {TAX_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{TAX_CATEGORY_LABELS[cat]}</option>
                    ))}
                  </Select>
                ) : (
                  <div className="relative">
                    <Select id="taxCategory" disabled className="cursor-not-allowed opacity-50">
                      <option>Uncategorized</option>
                    </Select>
                    <a
                      href="/settings/billing"
                      className="mt-1 block text-xs text-primary hover:underline"
                    >
                      Upgrade to Pro to categorize expenses for tax filing
                    </a>
                  </div>
                )}
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

              {/* Receipt upload */}
              <div className="space-y-2">
                <Label htmlFor="receipt">Receipt / Attachment</Label>
                <div className="flex items-center gap-3">
                  <label
                    htmlFor="receipt"
                    className="flex items-center gap-2 cursor-pointer rounded-lg border border-dashed border-slate-300 bg-slate-50/50 px-4 py-3 text-sm text-slate-500 hover:border-slate-400 hover:bg-slate-100/50 transition-colors flex-1"
                  >
                    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                    </svg>
                    <span>Attach receipt (PDF, JPG, PNG)</span>
                    <input id="receipt" type="file" className="sr-only" accept=".pdf,.jpg,.jpeg,.png" />
                  </label>
                </div>
                <p className="text-xs text-muted-foreground">Receipt storage coming soon — file will be saved locally for your records.</p>
              </div>

              {/* Recurring option */}
              {!isEditing && (
                <div className="rounded-lg border border-slate-200 bg-slate-50/30 p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <input
                      id="isRecurring"
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 accent-primary cursor-pointer"
                      {...register('isRecurring' as any)}
                    />
                    <label htmlFor="isRecurring" className="text-sm font-medium text-slate-700 cursor-pointer">
                      This is a recurring expense
                    </label>
                  </div>
                  {watch('isRecurring' as any) && (
                    <div className="space-y-1 pl-7">
                      <Label htmlFor="recurringFrequency" className="text-xs">Frequency</Label>
                      <Select id="recurringFrequency" {...register('recurringFrequency' as any)} className="max-w-xs">
                        <option value="WEEKLY">Weekly</option>
                        <option value="MONTHLY">Monthly</option>
                        <option value="QUARTERLY">Quarterly</option>
                        <option value="YEARLY">Yearly</option>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">Automated scheduling coming soon — set a reminder to record this expense.</p>
                    </div>
                  )}
                </div>
              )}

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
