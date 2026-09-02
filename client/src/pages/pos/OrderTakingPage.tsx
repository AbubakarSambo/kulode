import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Minus, Plus, ArrowLeft, UserPlus, X, Search, ChevronDown } from 'lucide-react'
import { Header } from '@/components/layout'
import { Button, Card, CardContent, Label, Input, Textarea, SearchableSelect } from '@/components/ui'
import { Modal } from '@/components/shared/Modal'
import { BottomSheet } from '@/components/shared/BottomSheet'
import { menuCategoriesApi, menuItemsApi, ordersApi, customersApi, tablesApi, usersApi, organizationsApi, orderTypesApi } from '@/api'
import type { ReceiptData } from '@/api/orders'
import { formatCurrency, cn } from '@/lib/utils'
import { printBill } from '@/lib/printBill'
import { useAuthStore } from '@/stores/auth'
import type { OrderSource } from '@/types'

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100
}

const customerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  notes: z.string().optional(),
})
type CustomerFormData = z.infer<typeof customerSchema>

const tableSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  section: z.string().optional(),
  capacity: z.string().optional(),
})
type TableFormData = z.infer<typeof tableSchema>

interface CartLine {
  menuItemId: string
  name: string
  price: number
  quantity: number
  notes?: string
}

export function OrderTakingPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const tableId = searchParams.get('tableId') || undefined
  const initialSource = (searchParams.get('source') as OrderSource) || 'Dine In'

  const queryClient = useQueryClient()
  // Fresh, not the auth store's login-time snapshot — an admin can flip these settings mid-shift
  // and a waiter already logged in should see it reflected without having to re-authenticate.
  const { data: organization } = useQuery({
    queryKey: ['organization'],
    queryFn: () => organizationsApi.getCurrent(),
    staleTime: 60_000,
  })
  const vatEnabled = !!organization?.vatEnabled
  // Rates come back from the API as numeric-looking strings (Prisma Decimal serializes to string
  // over JSON) — coerced here so downstream .toFixed() calls (e.g. in the print receipt) don't
  // throw "toFixed is not a function" on what's actually still a string.
  const vatRate = Number(organization?.taxRate ?? 0)
  const entertainmentTaxEnabled = !!organization?.entertainmentTaxEnabled
  const entertainmentTaxRate = Number(organization?.entertainmentTaxRate ?? 0)
  const serviceChargeEnabled = !!organization?.serviceChargeEnabled
  const serviceChargeRate = Number(organization?.serviceChargeRate ?? 0)

  // Draft persistence — lets a cashier navigate away mid-order (e.g. to check Tables) and come
  // back to find the cart exactly as they left it. Scoped per org+table (or "new" when this page
  // wasn't opened for a specific table) so drafts for different tables don't clobber each other.
  // The whole app blocks rendering until auth hydration completes (see App.tsx's `_hasHydrated`
  // check), so `authUser` — and therefore this key — is already available on the very first
  // render, which is what makes restoring via lazy useState initializers below safe.
  const authUser = useAuthStore((s) => s.user)
  const draftKey = authUser ? `pos-draft:${authUser.organizationId}:${tableId ?? 'new'}` : null
  const initialDraft = useMemo(() => {
    if (!draftKey) return null
    try {
      const raw = localStorage.getItem(draftKey)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed?.cart) && parsed.cart.length > 0 ? parsed : null
    } catch {
      return null // corrupt or inaccessible storage (e.g. private browsing) — just start fresh
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only ever needs to be read once, at mount, for whatever key this instance opened with
  }, [])

  const [applyVat, setApplyVat] = useState(() => (typeof initialDraft?.applyVat === 'boolean' ? initialDraft.applyVat : true))
  const [applyEntertainmentTax, setApplyEntertainmentTax] = useState(() =>
    typeof initialDraft?.applyEntertainmentTax === 'boolean' ? initialDraft.applyEntertainmentTax : true,
  )
  const [applyServiceCharge, setApplyServiceCharge] = useState(() =>
    typeof initialDraft?.applyServiceCharge === 'boolean' ? initialDraft.applyServiceCharge : true,
  )
  const [source, setSource] = useState<OrderSource>(() =>
    typeof initialDraft?.source === 'string' ? initialDraft.source : initialSource,
  )
  const [activeCategory, setActiveCategory] = useState<string | 'all'>('all')
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartLine[]>(() => initialDraft?.cart ?? [])
  const [customerId, setCustomerId] = useState(() => (typeof initialDraft?.customerId === 'string' ? initialDraft.customerId : ''))
  const [newCustomerOpen, setNewCustomerOpen] = useState(false)
  const [selectedTableId, setSelectedTableId] = useState(() =>
    typeof initialDraft?.selectedTableId === 'string' ? initialDraft.selectedTableId : '',
  )
  const [waiterId, setWaiterId] = useState(() => (typeof initialDraft?.waiterId === 'string' ? initialDraft.waiterId : ''))
  const [orderNotes, setOrderNotes] = useState(() => (typeof initialDraft?.orderNotes === 'string' ? initialDraft.orderNotes : ''))
  const [assignmentsOpen, setAssignmentsOpen] = useState(false)
  const [newTableOpen, setNewTableOpen] = useState(false)

  // Side effect only (a toast, not state) — fine inside an effect. Empty deps: announce once, for
  // whatever `initialDraft` this instance mounted with.
  useEffect(() => {
    if (initialDraft) toast.message('Restored your unsent order')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!draftKey) return
    try {
      if (cart.length === 0) {
        localStorage.removeItem(draftKey)
      } else {
        localStorage.setItem(
          draftKey,
          JSON.stringify({
            cart,
            customerId,
            waiterId,
            orderNotes,
            selectedTableId,
            source,
            applyVat,
            applyEntertainmentTax,
            applyServiceCharge,
          }),
        )
      }
    } catch {
      // Storage unavailable (private browsing, quota) — draft just won't persist this time.
    }
  }, [draftKey, cart, customerId, waiterId, orderNotes, selectedTableId, source, applyVat, applyEntertainmentTax, applyServiceCharge])

  const { data: tables } = useQuery({
    queryKey: ['restaurant-tables'],
    queryFn: () => tablesApi.list(),
  })
  const availableTables = useMemo(() => (tables ?? []).filter((t) => t.status === 'AVAILABLE'), [tables])

  const { data: orderTypes } = useQuery({ queryKey: ['order-types'], queryFn: () => orderTypesApi.list() })
  const sortedOrderTypes = useMemo(() => (orderTypes ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder), [orderTypes])
  const sourceRequiresTable = sortedOrderTypes.find((t) => t.name === source)?.requiresTable ?? false
  const effectiveTableId = tableId ?? (sourceRequiresTable ? selectedTableId || undefined : undefined)

  const { data: categories } = useQuery({ queryKey: ['menu-categories'], queryFn: () => menuCategoriesApi.list() })
  const { data: items } = useQuery({ queryKey: ['menu-items'], queryFn: () => menuItemsApi.list() })
  const [customerSearch, setCustomerSearch] = useState('')
  const [debouncedCustomerSearch, setDebouncedCustomerSearch] = useState('')
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedCustomerSearch(customerSearch), 300)
    return () => clearTimeout(handler)
  }, [customerSearch])
  // Only the 100 most-recently-created customers load by default — once a search is typed, this
  // hits the server instead so it's not limited to searching within that initial batch (e.g. an
  // org with thousands of customers imported at once would otherwise never find older ones here).
  const { data: customersPage } = useQuery({
    queryKey: ['customers', { limit: 100, search: debouncedCustomerSearch || undefined }],
    queryFn: () => customersApi.list({ limit: 100, search: debouncedCustomerSearch || undefined }),
  })
  const customerOptions = useMemo(
    () => (customersPage?.data ?? []).map((c) => ({ id: c.id, label: c.phone ? `${c.name} (${c.phone})` : c.name })),
    [customersPage],
  )
  const { data: waiters } = useQuery({
    queryKey: ['waiters-directory'],
    queryFn: () => usersApi.directory(['WAITER', 'CASHIER']),
  })
  const waiterOptions = useMemo(
    () => (waiters ?? []).map((w) => ({ id: w.id, label: `${w.firstName} ${w.lastName}` })),
    [waiters],
  )
  const selectedCustomerLabel = useMemo(
    () => customerOptions.find((c) => c.id === customerId)?.label,
    [customerOptions, customerId],
  )
  const selectedWaiterLabel = useMemo(
    () => waiterOptions.find((w) => w.id === waiterId)?.label,
    [waiterOptions, waiterId],
  )
  const tableOptions = useMemo(
    () => availableTables.map((t) => ({ id: t.id, label: t.name + (t.section ? ` — ${t.section}` : '') })),
    [availableTables],
  )
  const selectedTableLabel = useMemo(
    () => tableOptions.find((t) => t.id === selectedTableId)?.label,
    [tableOptions, selectedTableId],
  )
  const showTablePicker = !tableId && sourceRequiresTable

  const customerForm = useForm<CustomerFormData>({ resolver: zodResolver(customerSchema) })
  const createCustomer = useMutation({
    mutationFn: (data: CustomerFormData) =>
      customersApi.create({ ...data, phone: data.phone || undefined, email: data.email || undefined }),
    onSuccess: (customer) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      setCustomerId(customer.id)
      setNewCustomerOpen(false)
      customerForm.reset()
      toast.success('Customer added')
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(message || 'Failed to add customer')
    },
  })

  const tableForm = useForm<TableFormData>({ resolver: zodResolver(tableSchema) })
  const createTable = useMutation({
    mutationFn: (data: TableFormData) =>
      tablesApi.create({
        name: data.name,
        section: data.section || undefined,
        capacity: data.capacity ? Number(data.capacity) : undefined,
      }),
    onSuccess: (table) => {
      queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] })
      setSelectedTableId(table.id)
      setNewTableOpen(false)
      tableForm.reset()
      toast.success('Table added')
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(message || 'Failed to add table')
    },
  })

  const visibleItems = useMemo(() => {
    if (!items) return []
    const available = items.filter((i) => i.isAvailable)
    const byCategory =
      activeCategory === 'all' ? available : available.filter((i) => i.categories.some((c) => c.id === activeCategory))
    const query = search.trim().toLowerCase()
    return query ? byCategory.filter((i) => i.name.toLowerCase().includes(query)) : byCategory
  }, [items, activeCategory, search])

  const subtotal = cart.reduce((sum, line) => sum + line.price * line.quantity, 0)
  const vatAmount = vatEnabled && applyVat ? roundCurrency(subtotal * (vatRate / 100)) : 0
  const entertainmentTaxAmount =
    entertainmentTaxEnabled && applyEntertainmentTax ? roundCurrency(subtotal * (entertainmentTaxRate / 100)) : 0
  const serviceChargeAmount =
    serviceChargeEnabled && applyServiceCharge ? roundCurrency(subtotal * (serviceChargeRate / 100)) : 0
  const total = subtotal + vatAmount + entertainmentTaxAmount + serviceChargeAmount

  const effectiveTableName = useMemo(
    () => tables?.find((t) => t.id === effectiveTableId)?.name ?? null,
    [tables, effectiveTableId],
  )
  const selectedWaiter = waiters?.find((w) => w.id === waiterId)
  const selectedCustomer = customersPage?.data.find((c) => c.id === customerId)

  const handlePrintPreview = () => {
    if (!organization) return
    const receipt: ReceiptData = {
      receiptNumber: 'PREVIEW',
      createdAt: new Date().toISOString(),
      closedAt: null,
      source,
      table: effectiveTableName ? { name: effectiveTableName } : null,
      customer: selectedCustomer ? { name: selectedCustomer.name, phone: selectedCustomer.phone ?? null } : null,
      waiter: selectedWaiter ? { firstName: selectedWaiter.firstName, lastName: selectedWaiter.lastName } : null,
      items: cart.map((l) => ({ name: l.name, quantity: l.quantity, unitPrice: l.price, amount: l.price * l.quantity, notes: l.notes })),
      subtotal,
      taxAmount: vatAmount + entertainmentTaxAmount + serviceChargeAmount,
      total,
      amountPaid: 0,
      discountType: 'FIXED',
      discountPercent: 0,
      discountAmount: 0,
      vatApplied: vatEnabled && applyVat,
      vatRate,
      vatAmount,
      entertainmentTaxApplied: entertainmentTaxEnabled && applyEntertainmentTax,
      entertainmentTaxRate,
      entertainmentTaxAmount,
      serviceChargeApplied: serviceChargeEnabled && applyServiceCharge,
      serviceChargeRate,
      serviceChargeAmount,
      payments: [],
      organization: {
        name: organization.name,
        email: organization.email,
        phone: organization.phone,
        address: organization.address,
        currency: organization.currency,
        receiptBankName: organization.receiptBankName,
        receiptBankAccountNumber: organization.receiptBankAccountNumber,
        receiptBankAccountName: organization.receiptBankAccountName,
      },
    }
    printBill(receipt)
  }

  const addToCart = (menuItemId: string, name: string, price: number) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.menuItemId === menuItemId)
      if (existing) {
        return prev.map((l) => (l.menuItemId === menuItemId ? { ...l, quantity: l.quantity + 1 } : l))
      }
      return [{ menuItemId, name, price, quantity: 1 }, ...prev]
    })
  }

  const updateQuantity = (menuItemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) => (l.menuItemId === menuItemId ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0),
    )
  }

  const updateLineNotes = (menuItemId: string, notes: string) => {
    setCart((prev) => prev.map((l) => (l.menuItemId === menuItemId ? { ...l, notes } : l)))
  }

  const createOrder = useMutation({
    mutationFn: () =>
      ordersApi.create({
        tableId: effectiveTableId,
        customerId: customerId || undefined,
        waiterId: waiterId || undefined,
        source,
        items: cart.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity, notes: l.notes || undefined })),
        notes: orderNotes || undefined,
        applyVat,
        applyEntertainmentTax,
        applyServiceCharge,
      }),
    onSuccess: (result) => {
      if (draftKey) {
        try {
          localStorage.removeItem(draftKey)
        } catch {
          // ignore
        }
      }
      if ('__offlinePending' in result) {
        toast.success('No connection — order saved and will sync automatically', { duration: 4000 })
        navigate(`/pos/orders/${result.localOrderId}`)
        return
      }
      toast.success('Order sent')
      if (customerId) queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      navigate(`/pos/orders/${result.id}`)
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(message || 'Failed to create order')
    },
  })

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header
        title={tableId ? 'New Order' : `New ${source} Order`}
        description={tableId ? undefined : 'Select order type and add items'}
        action={
          tableId ? (
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {!tableId && (
            <div className="mb-4">
              <Label>Order Type</Label>
              <div className="mt-1 flex gap-2 overflow-x-auto pb-1">
                {sortedOrderTypes.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setSource(t.name)
                      setSelectedTableId('')
                    }}
                    className={cn(
                      'shrink-0 cursor-pointer rounded-full px-4 py-2 text-sm font-medium',
                      source === t.name ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="relative mb-4">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search menu items..."
              className="pl-11"
            />
          </div>

          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setActiveCategory('all')}
              className={cn(
                'shrink-0 cursor-pointer rounded-full px-4 py-2 text-sm font-medium',
                activeCategory === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
              )}
            >
              All
            </button>
            {categories?.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  'shrink-0 cursor-pointer rounded-full px-4 py-2 text-sm font-medium',
                  activeCategory === cat.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                )}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {visibleItems.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">No menu items match your search.</p>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {visibleItems.map((item) => (
              <button
                key={item.id}
                onClick={() => addToCart(item.id, item.name, item.price)}
                className="cursor-pointer rounded-2xl border border-border bg-card p-4 text-left shadow-[0px_12px_32px_rgba(0,55,176,0.08)] transition-all active:scale-95"
              >
                <div className="font-semibold text-foreground">{item.name}</div>
                <div className="mt-1 text-sm font-bold text-primary">{formatCurrency(item.price)}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex max-h-[45vh] w-full flex-col overflow-y-auto border-t border-border bg-card p-4 sm:p-6 lg:max-h-none lg:w-96 lg:overflow-y-visible lg:border-l lg:border-t-0">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Order Summary</h2>
          <div className="space-y-3 lg:flex-1 lg:overflow-y-auto">
            {cart.length === 0 && <p className="text-sm text-muted-foreground">No items added yet</p>}
            {cart.map((line) => (
              <div key={line.menuItemId} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">{line.name}</div>
                    <div className="text-xs text-muted-foreground">{formatCurrency(line.price)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateQuantity(line.menuItemId, -1)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-5 text-center text-sm font-semibold">{line.quantity}</span>
                    <button
                      onClick={() => updateQuantity(line.menuItemId, 1)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <Input
                  value={line.notes ?? ''}
                  onChange={(e) => updateLineNotes(line.menuItemId, e.target.value)}
                  placeholder="Add a note (e.g. no onions)"
                  className="h-8 text-xs"
                />
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setAssignmentsOpen(true)}
            className="mt-2 flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-muted/50 px-3 py-2.5 text-left"
          >
            <div className="min-w-0">
              <div className="text-xs font-medium text-muted-foreground">
                {showTablePicker ? 'Table, Customer, Waiter & Notes' : 'Customer, Waiter & Notes'}
              </div>
              <div className="truncate text-sm font-semibold text-foreground">
                {selectedTableLabel || selectedCustomerLabel || selectedWaiterLabel || orderNotes
                  ? [selectedTableLabel, selectedCustomerLabel, selectedWaiterLabel, orderNotes]
                      .filter(Boolean)
                      .join(' · ')
                  : 'Not set (optional)'}
              </div>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>

          <Card className="mt-4 p-4">
            <CardContent className="space-y-2 p-0">
              {(vatEnabled || entertainmentTaxEnabled || serviceChargeEnabled) && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium text-foreground">{formatCurrency(subtotal)}</span>
                </div>
              )}
              {vatEnabled && (
                <label className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={applyVat}
                      onChange={(e) => setApplyVat(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    VAT ({vatRate}%)
                  </span>
                  <span className="font-medium text-foreground">{formatCurrency(vatAmount)}</span>
                </label>
              )}
              {entertainmentTaxEnabled && (
                <label className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={applyEntertainmentTax}
                      onChange={(e) => setApplyEntertainmentTax(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    Entertainment Tax ({entertainmentTaxRate}%)
                  </span>
                  <span className="font-medium text-foreground">{formatCurrency(entertainmentTaxAmount)}</span>
                </label>
              )}
              {serviceChargeEnabled && (
                <label className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={applyServiceCharge}
                      onChange={(e) => setApplyServiceCharge(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    Service Charge ({serviceChargeRate}%)
                  </span>
                  <span className="font-medium text-foreground">{formatCurrency(serviceChargeAmount)}</span>
                </label>
              )}
              <div
                className={cn(
                  'flex items-center justify-between',
                  (vatEnabled || entertainmentTaxEnabled || serviceChargeEnabled) && 'border-t border-border pt-2',
                )}
              >
                <span className="font-semibold text-muted-foreground">Total</span>
                <span className="text-xl font-bold text-foreground">{formatCurrency(total)}</span>
              </div>
            </CardContent>
          </Card>

          <div className="mt-4 flex gap-2">
            <Button
              variant="outline"
              className="h-14 shrink-0 px-4 text-base"
              disabled={cart.length === 0}
              onClick={handlePrintPreview}
            >
              Print
            </Button>
            <Button
              className="h-14 flex-1 text-base"
              disabled={cart.length === 0 || (sourceRequiresTable && !effectiveTableId)}
              isLoading={createOrder.isPending}
              onClick={() => createOrder.mutate()}
            >
              Send Order
            </Button>
          </div>
        </div>
      </div>

      <BottomSheet
        isOpen={assignmentsOpen}
        onClose={() => setAssignmentsOpen(false)}
        title={showTablePicker ? 'Table, Customer, Waiter & Notes' : 'Customer, Waiter & Notes'}
        mobileOnly={false}
        panelClassName="sm:max-w-md sm:mx-auto sm:rounded-b-[32px]"
      >
        <div className="space-y-4 overflow-y-auto">
          {showTablePicker && (
            <div>
              <div className="flex items-center justify-between">
                <Label>Table</Label>
                <button
                  type="button"
                  onClick={() => setNewTableOpen(true)}
                  className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" /> New
                </button>
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                <div className="flex-1">
                  <SearchableSelect
                    options={tableOptions}
                    value={selectedTableId}
                    onChange={setSelectedTableId}
                    placeholder="Attach a table"
                  />
                </div>
                {selectedTableId && (
                  <button
                    type="button"
                    onClick={() => setSelectedTableId('')}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted"
                    aria-label="Clear table"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {tableOptions.length === 0 && (
                <p className="mt-1 text-xs text-muted-foreground">No available tables right now.</p>
              )}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between">
              <Label>Customer (optional)</Label>
              <button
                type="button"
                onClick={() => setNewCustomerOpen(true)}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <UserPlus className="h-3.5 w-3.5" /> New
              </button>
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <div className="flex-1">
                <SearchableSelect
                  options={customerOptions}
                  value={customerId}
                  onChange={setCustomerId}
                  onSearchChange={setCustomerSearch}
                  placeholder="Attach a customer"
                />
              </div>
              {customerId && (
                <button
                  type="button"
                  onClick={() => setCustomerId('')}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted"
                  aria-label="Clear customer"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div>
            <Label>Waiter (optional)</Label>
            <div className="mt-1 flex items-center gap-1.5">
              <div className="flex-1">
                <SearchableSelect
                  options={waiterOptions}
                  value={waiterId}
                  onChange={setWaiterId}
                  placeholder="Assign a waiter"
                />
              </div>
              {waiterId && (
                <button
                  type="button"
                  onClick={() => setWaiterId('')}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted"
                  aria-label="Clear waiter"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div>
            <Label>Notes (optional)</Label>
            <Textarea
              value={orderNotes}
              onChange={(e) => setOrderNotes(e.target.value)}
              placeholder="Add a note for this order (e.g. birthday, allergy, special request)"
              className="mt-1 text-sm"
              rows={3}
            />
          </div>

          <Button className="w-full" onClick={() => setAssignmentsOpen(false)}>
            Done
          </Button>
        </div>
      </BottomSheet>

      <Modal isOpen={newCustomerOpen} onClose={() => setNewCustomerOpen(false)} title="New Customer">
        <form onSubmit={customerForm.handleSubmit((data) => createCustomer.mutate(data))} className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input {...customerForm.register('name')} placeholder="e.g. Tunde Bakare" />
          </div>
          <div>
            <Label>Phone</Label>
            <Input {...customerForm.register('phone')} placeholder="+234 123 456 7890" />
          </div>
          <div>
            <Label>Email (optional)</Label>
            <Input type="email" {...customerForm.register('email')} placeholder="tunde@example.com" />
          </div>
          <Button type="submit" className="w-full" isLoading={createCustomer.isPending}>
            Add Customer
          </Button>
        </form>
      </Modal>

      <Modal isOpen={newTableOpen} onClose={() => setNewTableOpen(false)} title="New Table">
        <form onSubmit={tableForm.handleSubmit((data) => createTable.mutate(data))} className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input {...tableForm.register('name')} placeholder="e.g. Table 12" />
          </div>
          <div>
            <Label>Section (optional)</Label>
            <Input {...tableForm.register('section')} placeholder="e.g. Patio" />
          </div>
          <div>
            <Label>Capacity (optional)</Label>
            <Input type="number" {...tableForm.register('capacity')} placeholder="e.g. 4" />
          </div>
          <Button type="submit" className="w-full" isLoading={createTable.isPending}>
            Add Table
          </Button>
        </form>
      </Modal>
    </div>
  )
}
