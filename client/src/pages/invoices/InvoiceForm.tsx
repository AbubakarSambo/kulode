import { useState, useEffect, useRef } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Plus, Trash2, ChevronDown, Search } from 'lucide-react'
import { Header } from '@/components/layout'
import { Button, Input, Label, Textarea, Select, Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { clientsApi, invoicesApi, organizationsApi } from '@/api'
import { formatCurrency } from '@/lib/utils'
import { posthog } from '@/lib/posthog'
import type { ServiceItem } from '@/types'

function ServiceCombobox({
  items,
  onSelect,
}: {
  items: ServiceItem[]
  onSelect: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filtered = items.filter(
    (item) => item.name.toLowerCase().includes(query.toLowerCase()),
  )

  const selected = selectedId ? items.find((i) => i.id === selectedId) : null

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(!open); setQuery('') }}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        {selected ? (
          <span className="truncate">{selected.name} - {formatCurrency(selected.unitPrice)}</span>
        ) : (
          <span className="text-muted-foreground">Select a service...</span>
        )}
        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg">
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search services..."
              className="flex h-9 w-full bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-48 overflow-y-auto p-1">
            {filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => { setSelectedId(item.id); onSelect(item.id); setOpen(false); setQuery('') }}
                className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
              >
                <span>{item.name}</span>
                <span className="text-muted-foreground">{formatCurrency(item.unitPrice)}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-2 py-4 text-center text-sm text-muted-foreground">No services found</p>
            )}
            <button
              type="button"
              onClick={() => { setSelectedId(null); onSelect('custom'); setOpen(false); setQuery('') }}
              className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              Custom item
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const invoiceItemSchema = z.object({
  description: z.string(),
  quantity: z.number().min(0.01, 'Quantity must be greater than 0'),
  unitPrice: z.number().min(0, 'Price must be 0 or greater'),
})

const installmentSchema = z.object({
  label: z.string().min(1, 'Label is required'),
  percentage: z.number().min(1).max(100),
})

const invoiceSchema = z.object({
  clientId: z.string().min(1, 'Client is required'),
  issueDate: z.string().min(1, 'Issue date is required'),
  dueDate: z.string().min(1, 'Due date is required'),
  items: z.array(invoiceItemSchema).min(1, 'At least one item is required'),
  discountType: z.enum(['PERCENTAGE', 'FIXED']).optional(),
  discountPercent: z.number().min(0).optional(),
  installments: z.array(installmentSchema).optional(),
  notes: z.string().optional(),
  terms: z.string().optional(),
})

type InvoiceFormData = z.infer<typeof invoiceSchema>

export function NewInvoicePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const preselectedClientId = searchParams.get('clientId') || ''
  const [enableInstallments, setEnableInstallments] = useState(false)

  const { data: clientsData } = useQuery({
    queryKey: ['clients', { limit: 100 }],
    queryFn: () => clientsApi.list({ limit: 100 }),
  })

  const { data: serviceItems } = useQuery({
    queryKey: ['service-items'],
    queryFn: () => invoicesApi.listServiceItems(),
  })

  const { data: organization } = useQuery({
    queryKey: ['organization'],
    queryFn: () => organizationsApi.getCurrent(),
  })

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      clientId: preselectedClientId,
      issueDate: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      items: [{ description: '', quantity: 1, unitPrice: 0 }],
      discountType: 'PERCENTAGE',
      discountPercent: 0,
      installments: [],
      notes: '',
      terms: '',
    },
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  })

  const { fields: installmentFields, append: appendInstallment, remove: removeInstallment } = useFieldArray({
    control,
    name: 'installments',
  })

  useEffect(() => {
    if (organization?.paymentTerms && !watch('terms')) {
      setValue('terms', organization.paymentTerms)
    }
    if (organization?.defaultNotes && !watch('notes')) {
      setValue('notes', organization.defaultNotes)
    }
  }, [organization, setValue, watch])

  const handleServiceItemSelect = (index: number, serviceItemId: string) => {
    if (serviceItemId === 'custom') {
      return
    }
    const serviceItem = serviceItems?.find((item) => item.id === serviceItemId)
    if (serviceItem) {
      setValue(`items.${index}.description`, serviceItem.name)
      setValue(`items.${index}.unitPrice`, serviceItem.unitPrice)
    }
  }

  const watchInstallments = watch('installments') || []
  const installmentsTotal = watchInstallments.reduce((sum, inst) => sum + (inst?.percentage || 0), 0)

  const watchItems = watch('items')
  const watchDiscountType = watch('discountType') || 'PERCENTAGE'
  const watchDiscount = watch('discountPercent') || 0
  const subtotal = watchItems.reduce((sum, item) => {
    return sum + (item.quantity || 0) * (item.unitPrice || 0)
  }, 0)
  const discountAmount = watchDiscountType === 'FIXED'
    ? Math.min(watchDiscount, subtotal)
    : subtotal * (watchDiscount / 100)
  const afterDiscount = subtotal - discountAmount
  const vatEnabled = organization?.vatEnabled ?? false
  const orgTaxRate = organization?.taxRate ?? 0
  const vat = vatEnabled && orgTaxRate > 0 ? afterDiscount * (orgTaxRate / 100) : 0
  const total = afterDiscount + vat

  const createMutation = useMutation({
    mutationFn: (data: InvoiceFormData) => {
      // Validate installments add up to 100%
      if (enableInstallments && data.installments && data.installments.length > 0) {
        const total = data.installments.reduce((sum, inst) => sum + inst.percentage, 0)
        if (total !== 100) {
          throw new Error(`Installment percentages must add up to 100% (currently ${total}%)`)
        }
      }
      
      return invoicesApi.create({
        ...data,
        discountType: data.discountType || 'PERCENTAGE',
        discountPercent: Number(data.discountPercent) || 0,
        items: data.items.map(item => ({
          description: item.description,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
        })),
        installments: enableInstallments && data.installments && data.installments.length > 0
          ? data.installments.map(inst => ({
              label: inst.label,
              percentage: Number(inst.percentage),
            }))
          : undefined,
      })
    },
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      posthog.capture('invoice_created', {
        invoice_id: invoice.id,
        invoice_number: invoice.invoiceNumber,
        has_installments: enableInstallments,
      })
      toast.success('Invoice created', { description: `Invoice ${invoice.invoiceNumber} has been created` })
      navigate(`/invoices/${invoice.id}`)
    },
    onError: (error: any) => {
      toast.error('Failed to create invoice', {
        description: error.response?.data?.message || 'Please try again',
      })
    },
  })

  const onSubmit = (data: InvoiceFormData) => {
    createMutation.mutate(data)
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="New Invoice"
        description="Create a new invoice for your client"
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="mx-auto max-w-4xl space-y-6">
          {/* Client & Dates */}
          <Card>
            <CardHeader>
              <CardTitle>Invoice Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="clientId" required>Client</Label>
                  <Select
                    id="clientId"
                    {...register('clientId')}
                    error={errors.clientId?.message}
                  >
                    <option value="">Select a client</option>
                    {clientsData?.data.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="issueDate" required>Issue Date</Label>
                  <Input
                    id="issueDate"
                    type="date"
                    {...register('issueDate')}
                    error={errors.issueDate?.message}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dueDate" required>Due Date</Label>
                  <Input
                    id="dueDate"
                    type="date"
                    {...register('dueDate')}
                    error={errors.dueDate?.message}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Line Items */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Line Items</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ description: '', quantity: 1, unitPrice: 0 })}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Item
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Header - hidden on mobile */}
                <div className="hidden sm:grid sm:grid-cols-12 sm:gap-4 text-sm font-medium text-muted-foreground">
                  <div className="col-span-5">Service / Description</div>
                  <div className="col-span-2">Quantity</div>
                  <div className="col-span-2">Unit Price</div>
                  <div className="col-span-2 text-right">Amount</div>
                  <div className="col-span-1"></div>
                </div>

                {/* Items */}
                {fields.map((field, index) => {
                  const quantity = watchItems[index]?.quantity || 0
                  const unitPrice = watchItems[index]?.unitPrice || 0
                  const amount = quantity * unitPrice

                  return (
                    <div key={field.id} className="rounded-lg border p-3 space-y-3 sm:border-0 sm:p-0 sm:space-y-0 sm:grid sm:grid-cols-12 sm:gap-4 sm:items-start">
                      <div className="sm:col-span-5 space-y-2">
                        <label className="text-xs text-muted-foreground sm:hidden">Service / Description</label>
                        <div className="flex flex-col gap-3 sm:flex-row sm:gap-2 sm:items-start">
                          <div className="sm:basis-44 sm:shrink-0">
                            <ServiceCombobox
                              items={serviceItems || []}
                              onSelect={(id) => handleServiceItemSelect(index, id)}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <Input
                              placeholder="Description"
                              {...register(`items.${index}.description`)}
                              error={errors.items?.[index]?.description?.message}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 sm:contents">
                        <div className="sm:col-span-2">
                          <label className="text-xs text-muted-foreground sm:hidden">Qty</label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            {...register(`items.${index}.quantity`, { valueAsNumber: true })}
                            error={errors.items?.[index]?.quantity?.message}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-xs text-muted-foreground sm:hidden">Price</label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            {...register(`items.${index}.unitPrice`, { valueAsNumber: true })}
                          error={errors.items?.[index]?.unitPrice?.message}
                        />
                        </div>
                      </div>
                      <div className="flex items-center justify-between sm:col-span-2 sm:h-9 sm:justify-end">
                        <span className="text-xs text-muted-foreground sm:hidden">Amount:</span>
                        <span className="font-medium">{formatCurrency(amount)}</span>
                      </div>
                      <div className="flex justify-end sm:col-span-1">
                        {fields.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => remove(index)}
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}

                {/* Totals */}
                <div className="border-t pt-4">
                  <div className="sm:flex sm:justify-end">
                    <div className="w-full space-y-3 sm:w-72">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span className="font-medium">{formatCurrency(subtotal)}</span>
                      </div>
                      
                      {/* Discount Input */}
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">Discount</span>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            step={watchDiscountType === 'PERCENTAGE' ? '1' : '0.01'}
                            min="0"
                            max={watchDiscountType === 'PERCENTAGE' ? '100' : undefined}
                            className="w-24 text-right"
                            {...register('discountPercent', { valueAsNumber: true })}
                          />
                          <div className="flex rounded-md border">
                            <button
                              type="button"
                              onClick={() => setValue('discountType', 'PERCENTAGE')}
                              className={`px-2 py-1 text-xs rounded-l-md transition-colors ${watchDiscountType === 'PERCENTAGE' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                            >
                              %
                            </button>
                            <button
                              type="button"
                              onClick={() => setValue('discountType', 'FIXED')}
                              className={`px-2 py-1 text-xs rounded-r-md transition-colors ${watchDiscountType === 'FIXED' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                            >
                              &#8358;
                            </button>
                          </div>
                        </div>
                      </div>

                      {discountAmount > 0 && (
                        <div className="flex justify-between text-success">
                          <span>
                            Discount
                            {watchDiscountType === 'PERCENTAGE' ? ` (${watchDiscount}%)` : ''}
                          </span>
                          <span>-{formatCurrency(discountAmount)}</span>
                        </div>
                      )}
                      
                      {vat > 0 && (
                        <div className="flex justify-between text-muted-foreground">
                          <span>VAT ({orgTaxRate}%)</span>
                          <span>{formatCurrency(vat)}</span>
                        </div>
                      )}
                      
                      <div className="flex justify-between border-t pt-2 text-lg font-semibold">
                        <span>Total</span>
                        <span>{formatCurrency(total)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payment Installments */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Payment Installments</CardTitle>
              <label className="flex items-center gap-2 text-sm font-normal">
                <input
                  type="checkbox"
                  checked={enableInstallments}
                  onChange={(e) => {
                    setEnableInstallments(e.target.checked)
                    if (e.target.checked && installmentFields.length === 0) {
                      appendInstallment({ label: 'First Payment', percentage: 75 })
                      appendInstallment({ label: 'Final Payment', percentage: 25 })
                    }
                  }}
                  className="h-4 w-4 rounded border-gray-300"
                />
                Enable split payments
              </label>
            </CardHeader>
            {enableInstallments && (
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Define payment installments. Percentages must add up to 100%.
                </p>
                
                {installmentFields.map((field, index) => (
                  <div key={field.id} className="flex items-center gap-3">
                    <Input
                      placeholder="e.g., First Payment"
                      className="flex-1"
                      {...register(`installments.${index}.label`)}
                    />
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        min="1"
                        max="100"
                        className="w-20 text-right"
                        {...register(`installments.${index}.percentage`, { valueAsNumber: true })}
                      />
                      <span className="text-muted-foreground">%</span>
                    </div>
                    <span className="w-24 text-right text-sm font-medium">
                      {formatCurrency(total * ((watchInstallments[index]?.percentage || 0) / 100))}
                    </span>
                    {installmentFields.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeInstallment(index)}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                ))}
                
                <div className="flex items-center justify-between border-t pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => appendInstallment({ label: '', percentage: 0 })}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Installment
                  </Button>
                  
                  <div className={`text-sm font-medium ${installmentsTotal === 100 ? 'text-success' : 'text-destructive'}`}>
                    Total: {installmentsTotal}% {installmentsTotal !== 100 && '(must be 100%)'}
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Notes & Terms */}
          <Card>
            <CardHeader>
              <CardTitle>Additional Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    placeholder="Notes visible to the client..."
                    {...register('notes')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="terms">Terms & Conditions</Label>
                  <Textarea
                    id="terms"
                    placeholder="Payment terms..."
                    {...register('terms')}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex gap-3">
            <Button type="submit" isLoading={createMutation.isPending}>
              Create Invoice
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate(-1)}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
