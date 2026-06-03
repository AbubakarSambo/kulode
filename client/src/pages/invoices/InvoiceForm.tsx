import React, { useState, useEffect, useRef } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import type { FieldErrors } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Plus, Trash2, ChevronDown, Search, AlertTriangle } from 'lucide-react'
import { Header } from '@/components/layout'
import { Button, Input, Label, Textarea, Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { clientsApi, invoicesApi, organizationsApi, inventoryApi } from '@/api'
import type { CreateInventoryItemData } from '@/api/inventory'
import { formatCurrency } from '@/lib/utils'
import { posthog } from '@/lib/posthog'
import type { Client, ServiceItem, InventoryItem } from '@/types'

function ClientCombobox({
  clients,
  value,
  onChange,
  error,
  triggerRef,
}: {
  clients: Client[]
  value: string
  onChange: (clientId: string) => void
  error?: string
  triggerRef?: React.RefObject<HTMLButtonElement | null>
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setCreating(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selected = clients.find((c) => c.id === value)
  const filtered = clients.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))

  const createMutation = useMutation({
    mutationFn: () =>
      clientsApi.create({ name: newName.trim(), email: newEmail.trim() || undefined, phone: newPhone.trim() || undefined }),
    onSuccess: (client) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      posthog.capture('client_created', { client_id: client.id, source: 'invoice_form' })
      toast.success('Client created', { description: `${client.name} has been added` })
      onChange(client.id)
      setOpen(false)
      setCreating(false)
      setQuery('')
      setNewName('')
      setNewEmail('')
      setNewPhone('')
    },
    onError: (err: any) => {
      toast.error('Failed to create client', { description: err.response?.data?.message || 'Please try again' })
    },
  })

  function openDropdown() {
    setOpen(true)
    setCreating(false)
    setQuery('')
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function startCreating() {
    setCreating(true)
    setNewName(query)
    setQuery('')
  }

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={openDropdown}
        className={`flex h-9 w-full items-center justify-between rounded-md border bg-background px-3 py-1 text-sm shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground ${error ? 'border-destructive' : 'border-input'}`}
      >
        {selected ? (
          <span className="truncate">{selected.name}</span>
        ) : (
          <span className="text-muted-foreground">Select a client</span>
        )}
        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </button>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-card shadow-lg">
          {!creating ? (
            <>
              <div className="flex items-center border-b px-3">
                <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search clients..."
                  className="flex h-9 w-full bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
              <div className="max-h-56 overflow-y-auto p-1">
                {filtered.length > 0 ? (
                  filtered.map((client) => (
                    <button
                      key={client.id}
                      type="button"
                      onClick={() => { onChange(client.id); setOpen(false); setQuery('') }}
                      className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                    >
                      {client.name}
                    </button>
                  ))
                ) : (
                  <p className="px-2 py-3 text-center text-sm text-muted-foreground">
                    {query ? `No clients matching "${query}"` : 'No clients yet'}
                  </p>
                )}
                <div className="border-t mt-1 pt-1">
                  <button
                    type="button"
                    onClick={startCreating}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-primary hover:bg-accent"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {query ? `Create "${query}"` : 'New client'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">New client</p>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Name *"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
              />
              <input
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="Email (optional)"
                type="email"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
              />
              <input
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="Phone (optional)"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground">You can add more details from the client page later.</p>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={!newName.trim() || createMutation.isPending}
                  onClick={() => createMutation.mutate()}
                  className="flex-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50 hover:bg-primary/90"
                >
                  {createMutation.isPending ? 'Creating…' : 'Create client'}
                </button>
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
                >
                  Back
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

type ComboItem =
  | { kind: 'service'; item: ServiceItem }
  | { kind: 'inventory'; item: InventoryItem }

type CreatingKind = 'service' | 'inventory' | null

function ItemCombobox({
  serviceItems,
  inventoryItems,
  onSelect,
}: {
  serviceItems: ServiceItem[]
  inventoryItems: InventoryItem[]
  onSelect: (selection: { kind: 'service'; id: string; item?: ServiceItem } | { kind: 'inventory'; id: string; item?: InventoryItem } | { kind: 'custom' }) => void
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<ComboItem | null>(null)
  const [creating, setCreating] = useState<CreatingKind>(null)
  const [newName, setNewName] = useState('')
  const [newPrice, setNewPrice] = useState('')
  const [newStock, setNewStock] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setCreating(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const q = query.toLowerCase()
  const filteredServices = serviceItems.filter((i) => i.name.toLowerCase().includes(q))
  const filteredInventory = inventoryItems.filter((i) => i.name.toLowerCase().includes(q))
  const hasResults = filteredServices.length > 0 || filteredInventory.length > 0

  const selectedLabel = selected
    ? selected.kind === 'service'
      ? `${selected.item.name} — ${formatCurrency(selected.item.unitPrice)}`
      : `${selected.item.name} — ${formatCurrency((selected.item as InventoryItem).unitPrice)}`
    : null

  function startCreating(kind: 'service' | 'inventory') {
    setCreating(kind)
    setNewName(query)
    setNewPrice('')
    setNewStock('')
  }

  function resetCreate() {
    setCreating(null)
    setNewName('')
    setNewPrice('')
    setNewStock('')
  }

  const createServiceMutation = useMutation({
    mutationFn: () =>
      invoicesApi.createServiceItem({ name: newName.trim(), unitPrice: parseFloat(newPrice) }),
    onSuccess: (item) => {
      queryClient.invalidateQueries({ queryKey: ['service-items'] })
      toast.success('Service created', { description: item.name })
      setSelected({ kind: 'service', item })
      onSelect({ kind: 'service', id: item.id, item })
      setOpen(false)
      setQuery('')
      resetCreate()
    },
    onError: (err: any) => {
      toast.error('Failed to create service', { description: err.response?.data?.message || 'Please try again' })
    },
  })

  const createInventoryMutation = useMutation({
    mutationFn: () => {
      const data: CreateInventoryItemData = { name: newName.trim(), unitPrice: parseFloat(newPrice) }
      if (newStock) data.initialStock = parseInt(newStock)
      return inventoryApi.create(data)
    },
    onSuccess: (item) => {
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] })
      toast.success('Product created', { description: item.name })
      setSelected({ kind: 'inventory', item })
      onSelect({ kind: 'inventory', id: item.id, item })
      setOpen(false)
      setQuery('')
      resetCreate()
    },
    onError: (err: any) => {
      toast.error('Failed to create product', { description: err.response?.data?.message || 'Please try again' })
    },
  })

  const isPending = createServiceMutation.isPending || createInventoryMutation.isPending
  const canSubmit = newName.trim() && newPrice && parseFloat(newPrice) >= 0 && !isPending

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(!open); setQuery(''); setCreating(null) }}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        {selectedLabel ? (
          <span className="truncate">{selectedLabel}</span>
        ) : (
          <span className="text-muted-foreground">Select item...</span>
        )}
        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-card shadow-lg">
          {!creating ? (
            <>
              <div className="flex items-center border-b px-3">
                <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search items..."
                  className="flex h-9 w-full bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
              <div className="max-h-56 overflow-y-auto p-1">
                {filteredServices.length > 0 && (
                  <>
                    <p className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">Services</p>
                    {filteredServices.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setSelected({ kind: 'service', item })
                          onSelect({ kind: 'service', id: item.id })
                          setOpen(false)
                          setQuery('')
                        }}
                        className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                      >
                        <span>{item.name}</span>
                        <span className="text-muted-foreground">{formatCurrency(item.unitPrice)}</span>
                      </button>
                    ))}
                  </>
                )}

                {filteredInventory.length > 0 && (
                  <>
                    <p className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wide mt-1">Inventory</p>
                    {filteredInventory.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setSelected({ kind: 'inventory', item })
                          onSelect({ kind: 'inventory', id: item.id })
                          setOpen(false)
                          setQuery('')
                        }}
                        className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                      >
                        <span>{item.name}</span>
                        <span className="text-muted-foreground">
                          {formatCurrency(item.unitPrice)}
                          <span className="ml-2 text-xs">({item.availableQuantity} avail)</span>
                        </span>
                      </button>
                    ))}
                  </>
                )}

                {!hasResults && (
                  <p className="px-2 py-4 text-center text-sm text-muted-foreground">No items found</p>
                )}

                <div className="border-t mt-1 pt-1 space-y-0.5">
                  <button
                    type="button"
                    onClick={() => startCreating('service')}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-primary hover:bg-accent"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {query ? `New service "${query}"` : 'New service'}
                  </button>
                  <button
                    type="button"
                    onClick={() => startCreating('inventory')}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-primary hover:bg-accent"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {query ? `New product "${query}"` : 'New product'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(null)
                      onSelect({ kind: 'custom' })
                      setOpen(false)
                      setQuery('')
                    }}
                    className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  >
                    Custom item
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {creating === 'service' ? 'New service' : 'New product'}
              </p>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Name *"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
              />
              <input
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                placeholder="Unit price *"
                type="number"
                min="0"
                step="0.01"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
              />
              {creating === 'inventory' && (
                <input
                  value={newStock}
                  onChange={(e) => setNewStock(e.target.value)}
                  placeholder="Initial stock (optional)"
                  type="number"
                  min="0"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
                />
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={!canSubmit}
                  onClick={() => creating === 'service' ? createServiceMutation.mutate() : createInventoryMutation.mutate()}
                  className="flex-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50 hover:bg-primary/90"
                >
                  {isPending ? 'Creating…' : `Create ${creating === 'service' ? 'service' : 'product'}`}
                </button>
                <button
                  type="button"
                  onClick={resetCreate}
                  className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
                >
                  Back
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const invoiceItemSchema = z.object({
  serviceItemId: z.string().optional(),
  inventoryItemId: z.string().optional(),
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

  const { data: inventoryItems } = useQuery({
    queryKey: ['inventory-items'],
    queryFn: () => inventoryApi.list(),
  })

  const { data: organization } = useQuery({
    queryKey: ['organization'],
    queryFn: () => organizationsApi.getCurrent(),
  })

  const clientTriggerRef = useRef<HTMLButtonElement>(null)
  const itemsCardRef = useRef<HTMLDivElement>(null)

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    setFocus,
    formState: { errors },
  } = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceSchema),
    shouldFocusError: false,
    defaultValues: {
      clientId: preselectedClientId,
      issueDate: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      items: [{ serviceItemId: undefined, inventoryItemId: undefined, description: '', quantity: 1, unitPrice: 0 }],
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

  const handleItemSelect = (
    index: number,
    selection: { kind: 'service'; id: string; item?: ServiceItem } | { kind: 'inventory'; id: string; item?: InventoryItem } | { kind: 'custom' },
  ) => {
    if (selection.kind === 'custom') {
      setValue(`items.${index}.serviceItemId`, undefined)
      setValue(`items.${index}.inventoryItemId`, undefined)
      return
    }
    if (selection.kind === 'service') {
      const serviceItem = selection.item ?? serviceItems?.find((item) => item.id === selection.id)
      if (serviceItem) {
        setValue(`items.${index}.serviceItemId`, serviceItem.id)
        setValue(`items.${index}.inventoryItemId`, undefined)
        setValue(`items.${index}.description`, serviceItem.name)
        setValue(`items.${index}.unitPrice`, serviceItem.unitPrice)
        if (!watch(`items.${index}.quantity`)) setValue(`items.${index}.quantity`, 1)
      }
    } else {
      const invItem = selection.item ?? inventoryItems?.find((item) => item.id === selection.id)
      if (invItem) {
        setValue(`items.${index}.inventoryItemId`, invItem.id)
        setValue(`items.${index}.serviceItemId`, undefined)
        setValue(`items.${index}.description`, invItem.name)
        setValue(`items.${index}.unitPrice`, invItem.unitPrice)
        if (!watch(`items.${index}.quantity`)) setValue(`items.${index}.quantity`, 1)
      }
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
          serviceItemId: item.serviceItemId,
          inventoryItemId: item.inventoryItemId,
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

  function scrollAndFocus(el: HTMLElement | null) {
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.focus()
  }

  function focusField(name: Parameters<typeof setFocus>[0]) {
    setFocus(name)
    setTimeout(() => scrollAndFocus(document.activeElement as HTMLElement), 0)
  }

  const onFormError = (errs: FieldErrors<InvoiceFormData>) => {
    if (errs.clientId) {
      scrollAndFocus(clientTriggerRef.current)
      return
    }
    if (errs.issueDate) { focusField('issueDate'); return }
    if (errs.dueDate) { focusField('dueDate'); return }
    if (errs.items) {
      const itemsErr = errs.items as any
      // Array-level error (e.g. min(1))
      if (itemsErr.message) {
        itemsCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
      }
      // Field-level errors — find first row, first field
      for (let i = 0; i < fields.length; i++) {
        const row = itemsErr[i]
        if (!row) continue
        if (row.description) { focusField(`items.${i}.description`); return }
        if (row.quantity) { focusField(`items.${i}.quantity`); return }
        if (row.unitPrice) { focusField(`items.${i}.unitPrice`); return }
      }
      itemsCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  const onSubmit = (data: InvoiceFormData) => {
    createMutation.mutate(data)
  }

  return (
    <>
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="New Invoice"
        description="Create a new invoice for your client"
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <form onSubmit={handleSubmit(onSubmit, onFormError)} className="mx-auto max-w-4xl space-y-6">
          {/* Client & Dates */}
          <Card>
            <CardHeader>
              <CardTitle>Invoice Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label required>Client</Label>
                  <ClientCombobox
                    clients={clientsData?.data ?? []}
                    value={watch('clientId')}
                    onChange={(id) => setValue('clientId', id, { shouldValidate: true })}
                    error={errors.clientId?.message}
                    triggerRef={clientTriggerRef}
                  />
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
          <Card ref={itemsCardRef}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Line Items</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ serviceItemId: undefined, inventoryItemId: undefined, description: '', quantity: 1, unitPrice: 0 })}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Item
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Header - hidden on mobile */}
                <div className="hidden sm:grid sm:grid-cols-12 sm:gap-4 text-sm font-medium text-muted-foreground">
                  <div className="col-span-5">Item / Description</div>
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
                  const invItemId = watchItems[index]?.inventoryItemId
                  const invItem = invItemId ? inventoryItems?.find((i) => i.id === invItemId) : null
                  const stockWarning = invItem && quantity > invItem.availableQuantity
                    ? `Only ${invItem.availableQuantity} units available`
                    : null

                  return (
                    <div key={field.id} className="rounded-lg border p-3 space-y-3 sm:border-0 sm:p-0 sm:space-y-0 sm:grid sm:grid-cols-12 sm:gap-4 sm:items-start">
                      <div className="sm:col-span-5 space-y-2">
                        <label className="text-xs text-muted-foreground sm:hidden">Item / Description</label>
                        <div className="flex flex-col gap-2">
                          <ItemCombobox
                            serviceItems={serviceItems || []}
                            inventoryItems={inventoryItems || []}
                            onSelect={(sel) => handleItemSelect(index, sel)}
                          />
                          <Input
                            placeholder="Description"
                            {...register(`items.${index}.description`)}
                            error={errors.items?.[index]?.description?.message}
                          />
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
                          {stockWarning && (
                            <p className="mt-1 flex items-center gap-1 text-xs text-orange-500">
                              <AlertTriangle className="h-3 w-3" />
                              {stockWarning}
                            </p>
                          )}
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
    </>
  )
}
