import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Minus, Plus, ArrowLeft, UserPlus, X, Search } from 'lucide-react'
import { Header } from '@/components/layout'
import { Button, Card, CardContent, Label, Input, SearchableSelect } from '@/components/ui'
import { Modal } from '@/components/shared/Modal'
import { menuCategoriesApi, menuItemsApi, ordersApi, customersApi, tablesApi, waitersApi } from '@/api'
import { formatCurrency, cn } from '@/lib/utils'
import type { OrderSource } from '@/types'

const customerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().min(1, 'Phone is required'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  notes: z.string().optional(),
})
type CustomerFormData = z.infer<typeof customerSchema>

interface CartLine {
  menuItemId: string
  name: string
  price: number
  quantity: number
  notes?: string
}

const SOURCE_LABELS: Record<OrderSource, string> = {
  DINE_IN: 'Dine In',
  TAKEAWAY: 'Takeaway',
  DELIVERY: 'Delivery',
  THIRD_PARTY: 'Third Party',
}

export function OrderTakingPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const tableId = searchParams.get('tableId') || undefined
  const initialSource = (searchParams.get('source') as OrderSource) || (tableId ? 'DINE_IN' : 'TAKEAWAY')

  const queryClient = useQueryClient()
  const [source, setSource] = useState<OrderSource>(initialSource)
  const [activeCategory, setActiveCategory] = useState<string | 'all'>('all')
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [customerId, setCustomerId] = useState('')
  const [newCustomerOpen, setNewCustomerOpen] = useState(false)
  const [selectedTableId, setSelectedTableId] = useState('')
  const [waiterId, setWaiterId] = useState('')

  const { data: tables } = useQuery({
    queryKey: ['restaurant-tables'],
    queryFn: () => tablesApi.list(),
    enabled: !tableId,
  })
  const availableTables = useMemo(() => (tables ?? []).filter((t) => t.status === 'AVAILABLE'), [tables])
  const effectiveTableId = tableId ?? (source === 'DINE_IN' ? selectedTableId || undefined : undefined)

  const { data: categories } = useQuery({ queryKey: ['menu-categories'], queryFn: () => menuCategoriesApi.list() })
  const { data: items } = useQuery({ queryKey: ['menu-items'], queryFn: () => menuItemsApi.list() })
  const { data: customersPage } = useQuery({
    queryKey: ['customers', { limit: 100 }],
    queryFn: () => customersApi.list({ limit: 100 }),
  })
  const customerOptions = useMemo(
    () => (customersPage?.data ?? []).map((c) => ({ id: c.id, label: `${c.name} (${c.phone})` })),
    [customersPage],
  )
  const { data: waiters } = useQuery({ queryKey: ['waiters'], queryFn: () => waitersApi.list() })
  const waiterOptions = useMemo(
    () => (waiters ?? []).filter((w) => w.isActive).map((w) => ({ id: w.id, label: w.name })),
    [waiters],
  )

  const customerForm = useForm<CustomerFormData>({ resolver: zodResolver(customerSchema) })
  const createCustomer = useMutation({
    mutationFn: (data: CustomerFormData) => customersApi.create({ ...data, email: data.email || undefined }),
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

  const visibleItems = useMemo(() => {
    if (!items) return []
    const available = items.filter((i) => i.isAvailable)
    const byCategory =
      activeCategory === 'all' ? available : available.filter((i) => i.categories.some((c) => c.id === activeCategory))
    const query = search.trim().toLowerCase()
    return query ? byCategory.filter((i) => i.name.toLowerCase().includes(query)) : byCategory
  }, [items, activeCategory, search])

  const total = cart.reduce((sum, line) => sum + line.price * line.quantity, 0)

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
      }),
    onSuccess: (result) => {
      if ('__offlinePending' in result) {
        toast.success('No connection — order saved and will sync automatically', { duration: 4000 })
        navigate(`/pos/orders/${result.localOrderId}`)
        return
      }
      toast.success('Order sent')
      if (customerId) queryClient.invalidateQueries({ queryKey: ['customers'] })
      navigate(`/pos/orders/${result.id}`)
    },
    onError: () => toast.error('Failed to create order'),
  })

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header
        title={tableId ? 'New Order' : `New ${SOURCE_LABELS[source]} Order`}
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
                {(Object.keys(SOURCE_LABELS) as OrderSource[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setSource(s)
                      setSelectedTableId('')
                    }}
                    className={cn(
                      'shrink-0 cursor-pointer rounded-full px-4 py-2 text-sm font-medium',
                      source === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {SOURCE_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!tableId && source === 'DINE_IN' && (
            <div className="mb-4">
              <Label>Table</Label>
              <div className="mt-1 flex flex-wrap gap-2">
                {availableTables.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTableId(t.id)}
                    className={cn(
                      'shrink-0 cursor-pointer rounded-full px-4 py-2 text-sm font-medium',
                      selectedTableId === t.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {t.name}{t.section ? ` — ${t.section}` : ''}
                  </button>
                ))}
              </div>
              {availableTables.length === 0 && (
                <p className="mt-1 text-xs text-muted-foreground">No available tables right now.</p>
              )}
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

        <div className="flex w-full flex-col border-t border-border bg-card p-4 sm:p-6 lg:w-96 lg:border-l lg:border-t-0">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Order Summary</h2>
          <div className="flex-1 space-y-3 overflow-y-auto">
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

          <div className="mt-2">
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

          <div className="mt-2">
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

          <Card className="mt-4 p-4">
            <CardContent className="flex items-center justify-between p-0">
              <span className="font-semibold text-muted-foreground">Total</span>
              <span className="text-xl font-bold text-foreground">{formatCurrency(total)}</span>
            </CardContent>
          </Card>

          <Button
            className="mt-4 h-14 text-base"
            disabled={cart.length === 0 || (source === 'DINE_IN' && !effectiveTableId)}
            isLoading={createOrder.isPending}
            onClick={() => createOrder.mutate()}
          >
            Send Order
          </Button>
        </div>
      </div>

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
    </div>
  )
}
