import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Download, Plus, X, UserPlus, Pencil, Search } from 'lucide-react'
import { Header } from '@/components/layout'
import { Button, Card, CardContent, Badge, Input, Label, SearchableSelect, Textarea } from '@/components/ui'
import { Modal } from '@/components/shared/Modal'
import { ordersApi, menuCategoriesApi, menuItemsApi, customersApi, walletApi, usersApi, tablesApi, orderTypesApi, paymentTypesApi } from '@/api'
import { getQueuedActionsForLocalOrder, discardFailedAction, LOCAL_ORDER_PREFIX } from '@/lib/offlineOrderQueue'
import { formatCurrency, cn } from '@/lib/utils'
import { printBill } from '@/lib/printBill'
import { useAuthStore } from '@/stores/auth'
import type { OrderItemStatus, MenuItem, OrderSource } from '@/types'
import type { CreateOrderItemData } from '@/api/orders'

// Matches the backend's @Roles list on POST /orders/:id/close — only these roles can accept payment.
const PAYMENT_CAPABLE_ROLES = ['STAFF', 'ACCOUNTANT', 'CASHIER', 'ADMIN', 'SUPER_ADMIN']
// Matches the backend's @Roles list on POST /orders/:id/cancel.
const VOID_CAPABLE_ROLES = ['STAFF', 'ACCOUNTANT', 'SUPERVISOR', 'MANAGER', 'CASHIER', 'ADMIN', 'SUPER_ADMIN']
// Matches the backend's @Roles list on PATCH /orders/:id/discount — kept separate from void so
// giving cashiers void access doesn't also open up an unrestricted till-side discount.
const DISCOUNT_CAPABLE_ROLES = ['STAFF', 'ACCOUNTANT', 'SUPERVISOR', 'MANAGER', 'ADMIN', 'SUPER_ADMIN']
const ITEM_STATUS_FLOW: OrderItemStatus[] = ['PENDING', 'ON_IT', 'PASS', 'SERVED']
const ITEM_STATUS_LABELS: Record<OrderItemStatus, string> = {
  PENDING: 'Pending',
  ON_IT: 'On It',
  PASS: 'Pass',
  SERVED: 'Served',
}

const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'CARD', label: 'Card' },
  { value: 'PAYSTACK', label: 'Paystack (checkout link)' },
  { value: 'WALLET', label: 'Customer Wallet' },
  { value: 'OTHER', label: 'Other' },
] as const

const OFFLINE_PAYMENT_METHODS = PAYMENT_METHODS.filter(
  (m) => m.value !== 'PAYSTACK' && m.value !== 'WALLET',
)

// Display labels for the legacy built-in codes (still stored verbatim, never renamed — see the
// PaymentType migration). Anything else (a custom org type) is already a pretty name, no lookup needed.
const LEGACY_PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank Transfer',
  CARD: 'Card',
  OTHER: 'Other',
}

interface AddItemsModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (items: CreateOrderItemData[]) => void
  isSubmitting: boolean
}

function AddItemsModal({ isOpen, onClose, onSubmit, isSubmitting }: AddItemsModalProps) {
  const [cart, setCart] = useState<Record<string, { menuItem: MenuItem; quantity: number; notes?: string }>>({})
  const { data: categories } = useQuery({ queryKey: ['menu-categories'], queryFn: () => menuCategoriesApi.list(), enabled: isOpen })
  const { data: items } = useQuery({ queryKey: ['menu-items'], queryFn: () => menuItemsApi.list(), enabled: isOpen })
  const [activeCategory, setActiveCategory] = useState<string | 'all'>('all')
  const [search, setSearch] = useState('')

  const visibleItems = useMemo(() => {
    if (!items) return []
    const available = items.filter((i) => i.isAvailable)
    const byCategory =
      activeCategory === 'all' ? available : available.filter((i) => i.categories.some((c) => c.id === activeCategory))
    const query = search.trim().toLowerCase()
    return query ? byCategory.filter((i) => i.name.toLowerCase().includes(query)) : byCategory
  }, [items, activeCategory, search])

  const lines = Object.values(cart)
  const total = lines.reduce((sum, l) => sum + l.menuItem.price * l.quantity, 0)

  const addToCart = (menuItem: MenuItem) => {
    setCart((prev) => ({
      ...prev,
      [menuItem.id]: { menuItem, quantity: (prev[menuItem.id]?.quantity ?? 0) + 1 },
    }))
  }

  const updateQuantity = (menuItemId: string, delta: number) => {
    setCart((prev) => {
      const existing = prev[menuItemId]
      if (!existing) return prev
      const quantity = existing.quantity + delta
      if (quantity <= 0) {
        const rest = { ...prev }
        delete rest[menuItemId]
        return rest
      }
      return { ...prev, [menuItemId]: { ...existing, quantity } }
    })
  }

  const updateNotes = (menuItemId: string, notes: string) => {
    setCart((prev) => {
      const existing = prev[menuItemId]
      if (!existing) return prev
      return { ...prev, [menuItemId]: { ...existing, notes } }
    })
  }

  const handleSubmit = () => {
    onSubmit(lines.map((l) => ({ menuItemId: l.menuItem.id, quantity: l.quantity, notes: l.notes || undefined })))
    setCart({})
    setSearch('')
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Items">
      <div className="max-h-[70vh] space-y-4 overflow-y-auto">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search menu items..."
            className="pl-11"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveCategory('all')}
            className={cn(
              'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium',
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
                'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium',
                activeCategory === cat.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {visibleItems.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No menu items match your search.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {visibleItems.map((item) => {
              const inCart = cart[item.id]
              return (
                <button
                  key={item.id}
                  onClick={() => addToCart(item)}
                  className="rounded-xl border border-border bg-card p-3 text-left"
                >
                  <div className="truncate text-sm font-semibold text-foreground">{item.name}</div>
                  <div className="mt-0.5 flex items-center justify-between text-xs">
                    <span className="font-bold text-primary">{formatCurrency(item.price)}</span>
                    {inCart && <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">{inCart.quantity}</span>}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {lines.length > 0 && (
          <div className="space-y-2 rounded-xl bg-muted p-3">
            {lines.map((l) => (
              <div key={l.menuItem.id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{l.menuItem.name}</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => updateQuantity(l.menuItem.id, -1)} className="flex h-6 w-6 items-center justify-center rounded bg-background">-</button>
                    <span className="w-4 text-center font-semibold">{l.quantity}</span>
                    <button onClick={() => updateQuantity(l.menuItem.id, 1)} className="flex h-6 w-6 items-center justify-center rounded bg-background">+</button>
                  </div>
                </div>
                <Input
                  value={l.notes ?? ''}
                  onChange={(e) => updateNotes(l.menuItem.id, e.target.value)}
                  placeholder="Add a note (e.g. no onions)"
                  className="h-7 bg-background text-xs"
                />
              </div>
            ))}
            <div className="flex justify-between border-t border-border pt-2 text-sm font-bold text-foreground">
              <span>Total</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>
        )}

        <Button className="w-full" disabled={lines.length === 0} isLoading={isSubmitting} onClick={handleSubmit}>
          Add {lines.length > 0 ? `${lines.reduce((n, l) => n + l.quantity, 0)} item(s)` : 'items'} to order
        </Button>
      </div>
    </Modal>
  )
}

/** A locally-queued order that hasn't reached the server yet — reconstructed from the offline queue. */
function PendingOrderView({ localOrderId }: { localOrderId: string }) {
  const navigate = useNavigate()
  const [addItemsOpen, setAddItemsOpen] = useState(false)
  const [closeModalOpen, setCloseModalOpen] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<(typeof OFFLINE_PAYMENT_METHODS)[number]['value']>('CASH')
  const [otherPaymentNote, setOtherPaymentNote] = useState('')

  const { data: queuedActions, refetch } = useQuery({
    queryKey: ['offline-queue', localOrderId],
    queryFn: () => getQueuedActionsForLocalOrder(localOrderId),
    refetchInterval: 3_000,
  })
  const { data: menuItems } = useQuery({ queryKey: ['menu-items'], queryFn: () => menuItemsApi.list() })

  const createAction = queuedActions?.find((a) => a.type === 'CREATE_ORDER')
  const closeAction = queuedActions?.find((a) => a.type === 'CLOSE_ORDER')

  const menuItemById = useMemo(() => new Map((menuItems ?? []).map((m) => [m.id, m])), [menuItems])

  const allItems = useMemo(() => {
    if (!queuedActions) return []
    const fromCreate = queuedActions.find((a) => a.type === 'CREATE_ORDER')
    const fromAdds = queuedActions.filter((a) => a.type === 'ADD_ITEMS')
    return [
      ...(fromCreate?.type === 'CREATE_ORDER' ? fromCreate.payload.items : []),
      ...fromAdds.flatMap((a) => (a.type === 'ADD_ITEMS' ? a.payload.items : [])),
    ]
  }, [queuedActions])

  const estimatedTotal = allItems.reduce((sum, i) => sum + (menuItemById.get(i.menuItemId)?.price ?? 0) * i.quantity, 0)

  const addItems = useMutation({
    mutationFn: (items: CreateOrderItemData[]) => ordersApi.addItems(localOrderId, items),
    onSuccess: () => {
      toast.success('Queued — will be added once this order syncs')
      setAddItemsOpen(false)
      void refetch()
    },
  })

  const closeOrder = useMutation({
    mutationFn: () =>
      ordersApi.close(localOrderId, { paymentMethod, notes: paymentMethod === 'OTHER' ? otherPaymentNote : undefined }),
    onSuccess: () => {
      toast.success('Queued — order will close once it syncs')
      navigate('/pos/tables')
    },
  })

  const discardOrder = () => {
    if (createAction) void discardFailedAction(createAction.id)
    navigate('/pos/tables')
  }

  if (!createAction) {
    // Already synced (or was discarded) since this view mounted — nothing left to show here.
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-muted-foreground">This order has synced. Find it under Tables or Orders.</p>
        <Button onClick={() => navigate('/pos/tables')}>Back to Tables</Button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header
        title="Pending Sync"
        description="This order hasn't reached the server yet — it will send automatically once you're back online"
        action={
          <Button variant="ghost" size="sm" onClick={() => navigate('/pos/tables')}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <Badge variant="default">Waiting to sync</Badge>
        {closeAction && <Badge variant="success" className="ml-2">Close queued</Badge>}

        <div className="mt-4 space-y-3">
          {allItems.map((item, idx) => (
            <Card key={`${item.menuItemId}-${idx}`} className="p-4">
              <CardContent className="flex items-center justify-between p-0">
                <div className="font-semibold text-foreground">
                  {item.quantity}x {menuItemById.get(item.menuItemId)?.name ?? 'Item'}
                </div>
                <div className="font-semibold text-foreground">
                  {formatCurrency((menuItemById.get(item.menuItemId)?.price ?? 0) * item.quantity)}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="mt-6 p-4">
          <CardContent className="flex items-center justify-between p-0">
            <span className="font-semibold text-muted-foreground">Estimated Total</span>
            <span className="text-xl font-bold text-foreground">{formatCurrency(estimatedTotal)}</span>
          </CardContent>
        </Card>
        <p className="mt-1 text-xs text-muted-foreground">Final total (with tax) is confirmed once this order syncs.</p>

        {!closeAction && (
          <div className="mt-4 space-y-3">
            <Button variant="outline" className="w-full" onClick={() => setAddItemsOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Add More Items
            </Button>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={discardOrder}>
                <X className="mr-1.5 h-4 w-4" /> Discard
              </Button>
              <Button className="flex-1" onClick={() => setCloseModalOpen(true)}>
                Close & Pay
              </Button>
            </div>
          </div>
        )}
      </div>

      <AddItemsModal
        isOpen={addItemsOpen}
        onClose={() => setAddItemsOpen(false)}
        onSubmit={(items) => addItems.mutate(items)}
        isSubmitting={addItems.isPending}
      />

      <Modal isOpen={closeModalOpen} onClose={() => setCloseModalOpen(false)} title="Close Order (Cash/Offline Only)">
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Paystack checkout isn't available for an order that hasn't synced yet — choose an offline-friendly method.
          </p>
          <div>
            <Label>Payment Method</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {OFFLINE_PAYMENT_METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setPaymentMethod(m.value)}
                  className={cn(
                    'shrink-0 cursor-pointer rounded-full px-4 py-2 text-sm font-medium',
                    paymentMethod === m.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          {paymentMethod === 'OTHER' && (
            <div>
              <Label>Specify Payment Method</Label>
              <Input
                value={otherPaymentNote}
                onChange={(e) => setOtherPaymentNote(e.target.value)}
                placeholder="e.g. Cheque, Gift card"
              />
            </div>
          )}
          <div className="rounded-xl bg-muted p-4 text-center">
            <div className="text-sm text-muted-foreground">Estimated Amount Due</div>
            <div className="text-2xl font-bold text-foreground">{formatCurrency(estimatedTotal)}</div>
          </div>
          <Button
            className="w-full"
            isLoading={closeOrder.isPending}
            disabled={paymentMethod === 'OTHER' && !otherPaymentNote.trim()}
            onClick={() => closeOrder.mutate()}
          >
            Queue Close
          </Button>
        </div>
      </Modal>
    </div>
  )
}

function SyncedOrderView({ id }: { id: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  const canAcceptPayment = !!currentUser && currentUser.roles.some((r) => PAYMENT_CAPABLE_ROLES.includes(r))
  const canVoid = !!currentUser && currentUser.roles.some((r) => VOID_CAPABLE_ROLES.includes(r))
  const canApplyDiscount = !!currentUser && currentUser.roles.some((r) => DISCOUNT_CAPABLE_ROLES.includes(r))
  const [addItemsOpen, setAddItemsOpen] = useState(false)
  const [closeModalOpen, setCloseModalOpen] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<string>('CASH')
  const [customerEmail, setCustomerEmail] = useState('')
  const [otherPaymentNote, setOtherPaymentNote] = useState('')
  // Bill splitting: no split state is persisted server-side — each split is just another partial
  // payment against the same order (see closeWithPayment). "Even" recomputes the per-share amount
  // from whatever's still remaining each time (so rounding remainders land on the last share);
  // "Custom" lets the cashier type an arbitrary tender amount.
  const [splitMode, setSplitMode] = useState<'full' | 'even' | 'custom'>('full')
  const [evenWays, setEvenWays] = useState(2)
  const [customAmount, setCustomAmount] = useState('')
  const [customerModalOpen, setCustomerModalOpen] = useState(false)
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [waiterModalOpen, setWaiterModalOpen] = useState(false)
  const [selectedWaiterId, setSelectedWaiterId] = useState('')
  const [notesModalOpen, setNotesModalOpen] = useState(false)
  const [selectedNotes, setSelectedNotes] = useState('')
  const [mergeModalOpen, setMergeModalOpen] = useState(false)
  const [sourceModalOpen, setSourceModalOpen] = useState(false)
  const [selectedSource, setSelectedSource] = useState<OrderSource>('Dine In')
  const [selectedSourceTableId, setSelectedSourceTableId] = useState('')
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set())
  const [moveModalOpen, setMoveModalOpen] = useState(false)
  const [moveMode, setMoveMode] = useState<'new' | 'existing'>('new')
  const [moveTableId, setMoveTableId] = useState('')
  const [moveDestinationOrderId, setMoveDestinationOrderId] = useState('')
  const [discountModalOpen, setDiscountModalOpen] = useState(false)
  const [discountType, setDiscountType] = useState<'PERCENTAGE' | 'FIXED'>('PERCENTAGE')
  const [discountValue, setDiscountValue] = useState('')
  const [discountReason, setDiscountReason] = useState('')

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => ordersApi.get(id),
    refetchInterval: 10_000,
  })

  const { data: orderTypes } = useQuery({
    queryKey: ['order-types'],
    queryFn: () => orderTypesApi.list(),
    enabled: sourceModalOpen,
  })
  const sortedOrderTypes = useMemo(() => (orderTypes ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder), [orderTypes])
  const selectedSourceRequiresTable = sortedOrderTypes.find((t) => t.name === selectedSource)?.requiresTable ?? false

  const { data: walletBalance } = useQuery({
    queryKey: ['wallet-balance', order?.customer?.id],
    queryFn: () => walletApi.getBalance(order!.customer!.id),
    enabled: closeModalOpen && !!order?.customer,
  })

  const { data: paymentTypes } = useQuery({
    queryKey: ['payment-types'],
    queryFn: () => paymentTypesApi.list(),
    enabled: closeModalOpen,
  })
  // Org-managed methods first, Paystack/Wallet always tacked on last — those two are hardcoded/
  // protected, never part of the editable PaymentType list (Wallet only offered when a customer
  // is attached, same as before).
  const paymentMethodOptions = useMemo(() => {
    const managed = (paymentTypes ?? [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((t) => ({ value: t.name, label: LEGACY_PAYMENT_METHOD_LABELS[t.name] ?? t.name }))
    const fixed = [
      { value: 'PAYSTACK', label: 'Paystack (checkout link)' },
      ...(order?.customer ? [{ value: 'WALLET', label: 'Customer Wallet' }] : []),
    ]
    return [...managed, ...fixed]
  }, [paymentTypes, order?.customer])

  const { data: customersPage } = useQuery({
    queryKey: ['customers', { limit: 100 }],
    queryFn: () => customersApi.list({ limit: 100 }),
    enabled: customerModalOpen,
  })
  const customerOptions = useMemo(
    () => (customersPage?.data ?? []).map((c) => ({ id: c.id, label: c.phone ? `${c.name} (${c.phone})` : c.name })),
    [customersPage],
  )

  const setCustomer = useMutation({
    mutationFn: (customerId: string | null) => ordersApi.setCustomer(id, customerId),
    onSuccess: () => {
      toast.success('Customer updated')
      setCustomerModalOpen(false)
      queryClient.invalidateQueries({ queryKey: ['order', id] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['customers'] })
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(message || 'Failed to update customer')
    },
  })

  const { data: waiters } = useQuery({
    queryKey: ['waiters-directory'],
    queryFn: () => usersApi.directory(['WAITER', 'CASHIER']),
    enabled: waiterModalOpen,
  })
  const waiterOptions = useMemo(
    () => (waiters ?? []).map((w) => ({ id: w.id, label: `${w.firstName} ${w.lastName}` })),
    [waiters],
  )

  const setWaiter = useMutation({
    mutationFn: (waiterId: string | null) => ordersApi.setWaiter(id, waiterId),
    onSuccess: () => {
      toast.success('Waiter updated')
      setWaiterModalOpen(false)
      queryClient.invalidateQueries({ queryKey: ['order', id] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(message || 'Failed to update waiter')
    },
  })

  const setNotes = useMutation({
    mutationFn: (notes: string) => ordersApi.setNotes(id, notes),
    onSuccess: () => {
      toast.success('Notes updated')
      setNotesModalOpen(false)
      queryClient.invalidateQueries({ queryKey: ['order', id] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(message || 'Failed to update notes')
    },
  })

  const { data: mergeableOrdersPage } = useQuery({
    queryKey: ['orders', 'mergeable'],
    queryFn: () => ordersApi.list({ statuses: ['OPEN', 'IN_KITCHEN', 'READY'], limit: 50 }),
    enabled: mergeModalOpen || (moveModalOpen && moveMode === 'existing'),
  })
  // Can't merge/move into this order itself, and an order with a payment already on it is
  // rejected server-side anyway — filtered here too so it's never even offered as an option.
  const mergeableOrders = (mergeableOrdersPage?.data ?? []).filter(
    (o) => o.id !== id && Number(o.amountPaid) === 0,
  )

  const mergeOrder = useMutation({
    mutationFn: (sourceOrderId: string) => ordersApi.merge(id, sourceOrderId),
    onSuccess: () => {
      toast.success('Orders merged')
      setMergeModalOpen(false)
      queryClient.invalidateQueries({ queryKey: ['order', id] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(message || 'Failed to merge orders')
    },
  })

  const { data: tables } = useQuery({
    queryKey: ['restaurant-tables'],
    queryFn: () => tablesApi.list(),
    enabled: sourceModalOpen || (moveModalOpen && moveMode === 'new'),
  })
  const availableTableOptions = (tables ?? [])
    .filter((t) => t.status === 'AVAILABLE' || t.id === order?.tableId)
    .map((t) => ({ id: t.id, label: t.name }))

  const moveItems = useMutation({
    mutationFn: () =>
      ordersApi.moveItems(id, {
        itemIds: Array.from(selectedItemIds),
        destinationOrderId: moveMode === 'existing' ? moveDestinationOrderId : undefined,
        tableId: moveMode === 'new' && moveTableId ? moveTableId : undefined,
      }),
    onSuccess: (destination) => {
      toast.success('Items moved')
      setMoveModalOpen(false)
      setSelectedItemIds(new Set())
      setMoveTableId('')
      setMoveDestinationOrderId('')
      queryClient.invalidateQueries({ queryKey: ['order', id] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] })
      if (destination.id !== id) navigate(`/pos/orders/${destination.id}`)
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(message || 'Failed to move items')
    },
  })

  const setSource = useMutation({
    mutationFn: () => ordersApi.setSource(id, selectedSource, selectedSourceRequiresTable ? selectedSourceTableId : undefined),
    onSuccess: () => {
      toast.success('Order type updated')
      setSourceModalOpen(false)
      queryClient.invalidateQueries({ queryKey: ['order', id] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] })
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(message || 'Failed to update order type')
    },
  })

  const applyDiscount = useMutation({
    mutationFn: (data: { discountType: 'PERCENTAGE' | 'FIXED'; value: number; reason: string }) =>
      ordersApi.applyDiscount(id, data),
    onSuccess: () => {
      toast.success('Discount updated')
      setDiscountModalOpen(false)
      setDiscountValue('')
      setDiscountReason('')
      queryClient.invalidateQueries({ queryKey: ['order', id] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(message || 'Failed to apply discount')
    },
  })

  const updateItemStatus = useMutation({
    mutationFn: ({ itemId, status }: { itemId: string; status: OrderItemStatus }) =>
      ordersApi.updateItemStatus(id, itemId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
    onError: () => toast.error('Failed to update item status'),
  })

  const updateItemQuantity = useMutation({
    mutationFn: ({ itemId, quantity }: { itemId: string; quantity: number }) =>
      ordersApi.updateItemQuantity(id, itemId, quantity),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(message || 'Failed to update quantity')
    },
  })

  const addItems = useMutation({
    mutationFn: (items: CreateOrderItemData[]) => ordersApi.addItems(id, items),
    onSuccess: (result) => {
      if ('__offlinePending' in result) {
        toast.success('No connection — items queued and will sync automatically')
      } else {
        toast.success('Items added')
      }
      setAddItemsOpen(false)
      queryClient.invalidateQueries({ queryKey: ['order', id] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(message || 'Failed to add items')
    },
  })

  const cancelOrder = useMutation({
    mutationFn: () => ordersApi.cancel(id),
    onSuccess: () => {
      toast.success('Order cancelled')
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      navigate('/pos/tables')
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(message || 'Failed to cancel order')
    },
  })

  const printBillMutation = useMutation({
    mutationFn: async () => printBill(await ordersApi.getReceiptData(id)),
    onError: () => toast.error('Failed to print bill'),
  })

  const markAwaitingPayment = useMutation({
    mutationFn: () => ordersApi.markAwaitingPayment(id),
    onSuccess: () => {
      toast.success('Order marked ready — a cashier can now take payment')
      queryClient.invalidateQueries({ queryKey: ['order', id] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      printBillMutation.mutate()
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(message || 'Failed to mark order ready for payment')
    },
  })

  // Recomputed from the order's current amountPaid, not cached — so after a partial payment the
  // *next* even share and the remaining balance are both derived from server truth.
  const orderTotal = order ? Number(order.total) : 0
  const amountPaidSoFar = order ? Number(order.amountPaid) : 0
  const remainingBalance = Math.max(0, Math.round((orderTotal - amountPaidSoFar) * 100) / 100)
  const evenShare = Math.round((remainingBalance / Math.max(1, evenWays)) * 100) / 100
  const paymentAmount =
    splitMode === 'even' ? evenShare : splitMode === 'custom' ? Number(customAmount) || 0 : remainingBalance

  const closeOrder = useMutation({
    mutationFn: async () => {
      if (paymentMethod === 'PAYSTACK') {
        return ordersApi.paystackCheckout(id, { paymentMethod, customerEmail })
      }
      return ordersApi.close(id, {
        paymentMethod,
        amount: paymentAmount,
        notes: paymentMethod === 'OTHER' ? otherPaymentNote : undefined,
      })
    },
    onSuccess: (result) => {
      if ('paymentUrl' in result) {
        window.open(result.paymentUrl, '_blank')
        toast.success('Checkout link opened — order closes once payment confirms')
        setCloseModalOpen(false)
        return
      }
      if ('__offlinePending' in result) {
        toast.success('No connection — close queued and will sync automatically')
        setCloseModalOpen(false)
        navigate('/pos/tables')
        return
      }
      if (result.status !== 'CLOSED_PAID') {
        // Partial payment recorded — more splits still owed, keep the modal open for the next one.
        const stillDue = Math.max(0, Math.round((orderTotal - Number(result.amountPaid)) * 100) / 100)
        toast.success(`Payment recorded — ${formatCurrency(stillDue)} still due`)
        queryClient.invalidateQueries({ queryKey: ['order', id] })
        queryClient.invalidateQueries({ queryKey: ['orders'] })
        if (splitMode === 'even') setEvenWays((w) => Math.max(1, w - 1))
        setCustomAmount('')
        return
      }
      toast.success('Order closed')
      if (order?.customerId) {
        queryClient.invalidateQueries({ queryKey: ['customers'] })
        queryClient.invalidateQueries({ queryKey: ['wallet-balance', order.customerId] })
        queryClient.invalidateQueries({ queryKey: ['wallet-transactions', order.customerId] })
      }
      setCloseModalOpen(false)
      setSplitMode('full')
      setEvenWays(2)
      setCustomAmount('')
      queryClient.invalidateQueries({ queryKey: ['order', id] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(message || 'Failed to close order')
    },
  })

  const downloadReceipt = async () => {
    const blob = await ordersApi.downloadReceipt(id)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `receipt-${id.slice(0, 8)}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (isLoading || !order) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  const isOpenStatus = ['OPEN', 'IN_KITCHEN', 'READY'].includes(order.status)
  // Adding items also pulls the order back out of "awaiting payment" (see addItems on the API
  // side), so it stays available on CLOSED_UNPAID too — e.g. a guest orders dessert while waiting
  // to settle up.
  const canAddItems = isOpenStatus || order.status === 'CLOSED_UNPAID'
  const canEditCustomerOrWaiter = order.status !== 'CANCELLED'

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header
        title={order.table ? order.table.name : order.source.replace('_', ' ')}
        description={`Order #${order.id.slice(0, 8).toUpperCase()}`}
        action={
          <Button variant="ghost" size="sm" onClick={() => navigate('/pos/tables')}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <Badge variant={order.status === 'CLOSED_PAID' ? 'success' : order.status === 'CANCELLED' ? 'destructive' : 'default'}>
            {order.status.replace('_', ' ')}
          </Badge>
          {order.status === 'CLOSED_PAID' && (
            <Button variant="outline" size="sm" onClick={downloadReceipt}>
              <Download className="mr-1.5 h-4 w-4" /> Receipt
            </Button>
          )}
          {canAddItems && (
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => setAddItemsOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Add Items
            </Button>
          )}
        </div>

        <div className="mb-4 flex items-center justify-between rounded-xl border border-border p-3">
          <span className="text-sm font-medium text-foreground">
            {order.source}{order.table ? ` · ${order.table.name}` : ''}
          </span>
          {isOpenStatus && (
            <button
              type="button"
              onClick={() => {
                setSelectedSource(order.source)
                setSelectedSourceTableId(order.tableId ?? '')
                setSourceModalOpen(true)
              }}
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <Pencil className="h-3.5 w-3.5" /> Change
            </button>
          )}
        </div>

        <div className="mb-4 flex items-center justify-between rounded-xl border border-border p-3">
          {order.customer ? (
            <Link to={`/pos/customers/${order.customer.id}`} className="text-sm font-medium text-foreground hover:underline">
              {order.customer.name}{order.customer.phone ? ` · ${order.customer.phone}` : ''}
            </Link>
          ) : (
            <span className="text-sm text-muted-foreground">No customer attached</span>
          )}
          {canEditCustomerOrWaiter && (
            <button
              type="button"
              onClick={() => {
                setSelectedCustomerId(order.customerId ?? '')
                setCustomerModalOpen(true)
              }}
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              {order.customer ? <Pencil className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
              {order.customer ? 'Change' : 'Attach'}
            </button>
          )}
        </div>

        <div className="mb-4 flex items-center justify-between rounded-xl border border-border p-3">
          {order.waiter ? (
            <span className="text-sm font-medium text-foreground">{order.waiter.firstName} {order.waiter.lastName}</span>
          ) : (
            <span className="text-sm text-muted-foreground">No waiter assigned</span>
          )}
          {canEditCustomerOrWaiter && (
            <button
              type="button"
              onClick={() => {
                setSelectedWaiterId(order.waiterId ?? '')
                setWaiterModalOpen(true)
              }}
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              {order.waiter ? <Pencil className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
              {order.waiter ? 'Change' : 'Assign'}
            </button>
          )}
        </div>

        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-border p-3">
          <div className="min-w-0">
            <span className="text-xs font-medium text-muted-foreground">Notes</span>
            {order.notes ? (
              <p className="mt-0.5 text-sm text-foreground">{order.notes}</p>
            ) : (
              <p className="mt-0.5 text-sm text-muted-foreground">No notes</p>
            )}
          </div>
          {canEditCustomerOrWaiter && (
            <button
              type="button"
              onClick={() => {
                setSelectedNotes(order.notes ?? '')
                setNotesModalOpen(true)
              }}
              className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <Pencil className="h-3.5 w-3.5" /> {order.notes ? 'Edit' : 'Add'}
            </button>
          )}
        </div>

        {isOpenStatus && selectedItemIds.size > 0 && (
          <div className="mb-3 flex items-center justify-between rounded-xl border border-border bg-muted/50 px-4 py-2.5">
            <span className="text-sm font-medium text-foreground">{selectedItemIds.size} item{selectedItemIds.size === 1 ? '' : 's'} selected</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setSelectedItemIds(new Set())}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => { setMoveMode('new'); setMoveTableId(order.tableId ?? ''); setMoveDestinationOrderId(''); setMoveModalOpen(true) }}>
                Move Selected Items
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {order.items.map((item) => (
            <Card key={item.id} className="p-4">
              <CardContent className="p-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {isOpenStatus && (
                      <input
                        type="checkbox"
                        checked={selectedItemIds.has(item.id)}
                        onChange={() => {
                          setSelectedItemIds((prev) => {
                            const next = new Set(prev)
                            if (next.has(item.id)) next.delete(item.id)
                            else next.add(item.id)
                            return next
                          })
                        }}
                        className="h-4 w-4 shrink-0 rounded border-border accent-primary"
                      />
                    )}
                    <div>
                      <div className="font-semibold text-foreground">
                        {isOpenStatus && item.status === 'PENDING' ? '' : `${item.quantity}x `}
                        {item.menuItem?.name ?? item.itemName}
                      </div>
                      {item.notes && <div className="text-xs text-muted-foreground">{item.notes}</div>}
                      {isOpenStatus && item.status === 'PENDING' && (
                        <div className="mt-1.5 flex items-center gap-3">
                          <button
                            type="button"
                            disabled={updateItemQuantity.isPending}
                            onClick={() => {
                              if (item.quantity <= 1) {
                                if (window.confirm('Remove this item from the order?')) {
                                  updateItemQuantity.mutate({ itemId: item.id, quantity: 0 })
                                }
                              } else {
                                updateItemQuantity.mutate({ itemId: item.id, quantity: item.quantity - 1 })
                              }
                            }}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-muted font-bold text-foreground disabled:opacity-50"
                          >
                            −
                          </button>
                          <span className="w-5 text-center text-sm font-semibold text-foreground">{item.quantity}</span>
                          <button
                            type="button"
                            disabled={updateItemQuantity.isPending}
                            onClick={() => updateItemQuantity.mutate({ itemId: item.id, quantity: item.quantity + 1 })}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-muted font-bold text-foreground disabled:opacity-50"
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="font-semibold text-foreground">{formatCurrency(item.amount)}</div>
                </div>
                {isOpenStatus && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {ITEM_STATUS_FLOW.map((s) => (
                      <button
                        key={s}
                        onClick={() => updateItemStatus.mutate({ itemId: item.id, status: s })}
                        className={cn(
                          'min-h-11 rounded-full px-4 py-2 text-sm font-semibold',
                          item.status === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {ITEM_STATUS_LABELS[s]}
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="mt-6 p-4">
          <CardContent className="space-y-2 p-0">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Subtotal</span>
              <span>{formatCurrency(order.subtotal)}</span>
            </div>
            {order.discountAmount > 0 && (
              <div className="flex justify-between text-sm text-destructive">
                <span>Discount{order.discountType === 'PERCENTAGE' ? ` (${order.discountPercent}%)` : ''}</span>
                <span>−{formatCurrency(order.discountAmount)}</span>
              </div>
            )}
            {order.vatAmount > 0 || order.entertainmentTaxAmount > 0 ? (
              <>
                {order.vatAmount > 0 && (
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>VAT</span>
                    <span>{formatCurrency(order.vatAmount)}</span>
                  </div>
                )}
                {order.entertainmentTaxAmount > 0 && (
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Entertainment Tax</span>
                    <span>{formatCurrency(order.entertainmentTaxAmount)}</span>
                  </div>
                )}
              </>
            ) : (
              order.taxAmount > 0 && (
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Tax</span>
                  <span>{formatCurrency(order.taxAmount)}</span>
                </div>
              )
            )}
            {order.serviceChargeAmount > 0 && (
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Service Charge</span>
                <span>{formatCurrency(order.serviceChargeAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold text-foreground">
              <span>Total</span>
              <span>{formatCurrency(order.total)}</span>
            </div>
          </CardContent>
        </Card>

        {isOpenStatus && (
          <div className="mt-4 flex gap-3">
            {canVoid && (
              <Button variant="outline" className="flex-1" onClick={() => cancelOrder.mutate()} isLoading={cancelOrder.isPending}>
                <X className="mr-1.5 h-4 w-4" /> Void Order
              </Button>
            )}
            {canAcceptPayment ? (
              <Button className="flex-1" onClick={() => setCloseModalOpen(true)}>
                Close & Pay
              </Button>
            ) : (
              <Button
                className="flex-1"
                onClick={() => markAwaitingPayment.mutate()}
                isLoading={markAwaitingPayment.isPending}
              >
                Mark Ready for Payment
              </Button>
            )}
          </div>
        )}

        {isOpenStatus && (canVoid || canAcceptPayment) && (
          <div className="mt-3">
            <Button variant="outline" className="w-full" onClick={() => setMergeModalOpen(true)}>
              Merge Another Order In
            </Button>
          </div>
        )}

        {(isOpenStatus || order.status === 'CLOSED_UNPAID' || order.status === 'CLOSED_PAID') && (
          <div className="mt-3">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => printBillMutation.mutate()}
              isLoading={printBillMutation.isPending}
            >
              {order.status === 'CLOSED_PAID' ? 'Print Receipt' : 'Print Bill'}
            </Button>
          </div>
        )}

        {order.status === 'CLOSED_UNPAID' && (
          <div className="mt-4 flex gap-3">
            {canVoid && (
              <Button variant="outline" className="flex-1" onClick={() => cancelOrder.mutate()} isLoading={cancelOrder.isPending}>
                <X className="mr-1.5 h-4 w-4" /> Void Order
              </Button>
            )}
            {canAcceptPayment && (
              <Button className="flex-1" onClick={() => setCloseModalOpen(true)}>
                Accept Payment
              </Button>
            )}
          </div>
        )}
      </div>

      <AddItemsModal
        isOpen={addItemsOpen}
        onClose={() => setAddItemsOpen(false)}
        onSubmit={(items) => addItems.mutate(items)}
        isSubmitting={addItems.isPending}
      />

      <Modal isOpen={closeModalOpen} onClose={() => setCloseModalOpen(false)} title="Close Order">
        <div className="space-y-4">
          {canApplyDiscount && (
            <div className="flex items-center justify-between rounded-xl border border-border p-3">
              {order.discountAmount > 0 ? (
                <div>
                  <div className="text-sm font-medium text-foreground">
                    {order.discountType === 'PERCENTAGE' ? `${order.discountPercent}% off` : `${formatCurrency(order.discountAmount)} off`}
                  </div>
                  {order.discountReason && <div className="text-xs text-muted-foreground">{order.discountReason}</div>}
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">No discount applied</span>
              )}
              <div className="flex gap-2">
                {order.discountAmount > 0 && (
                  <button
                    type="button"
                    onClick={() => applyDiscount.mutate({ discountType: order.discountType, value: 0, reason: 'Discount removed' })}
                    className="text-xs font-medium text-destructive hover:underline"
                  >
                    Remove
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setDiscountType(order.discountType)
                    setDiscountValue(order.discountAmount > 0 ? String(order.discountType === 'PERCENTAGE' ? order.discountPercent : order.discountAmount) : '')
                    setDiscountReason('')
                    setDiscountModalOpen(true)
                  }}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  {order.discountAmount > 0 ? 'Change' : 'Apply Discount'}
                </button>
              </div>
            </div>
          )}
          <div>
            <Label>Payment Method</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {paymentMethodOptions.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setPaymentMethod(m.value)}
                  className={cn(
                    'shrink-0 cursor-pointer rounded-full px-4 py-2 text-sm font-medium',
                    paymentMethod === m.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          {paymentMethod === 'PAYSTACK' && (
            <div>
              <Label>Customer Email</Label>
              <Input
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="customer@email.com"
              />
            </div>
          )}
          {paymentMethod === 'OTHER' && (
            <div>
              <Label>Specify Payment Method</Label>
              <Input
                value={otherPaymentNote}
                onChange={(e) => setOtherPaymentNote(e.target.value)}
                placeholder="e.g. Cheque, Gift card"
              />
            </div>
          )}
          {paymentMethod === 'WALLET' && (() => {
            const balanceAfter = walletBalance ? walletBalance.balance - paymentAmount : undefined
            const exceedsCredit = balanceAfter !== undefined && balanceAfter < -(walletBalance?.creditLimit ?? 0)
            return (
              <div className="rounded-xl border border-border p-3 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Current balance</span>
                  <span className={cn('font-semibold', (walletBalance?.balance ?? 0) < 0 ? 'text-destructive' : 'text-foreground')}>
                    {walletBalance ? formatCurrency(walletBalance.balance) : '—'}
                  </span>
                </div>
                <div className="mt-1 flex justify-between text-muted-foreground">
                  <span>Balance after payment</span>
                  <span className={cn('font-semibold', balanceAfter !== undefined && balanceAfter < 0 ? 'text-destructive' : 'text-foreground')}>
                    {balanceAfter !== undefined ? formatCurrency(balanceAfter) : '—'}
                  </span>
                </div>
                {balanceAfter !== undefined && balanceAfter < 0 && (
                  <p className={cn('mt-2 text-xs', exceedsCredit ? 'text-destructive' : 'text-muted-foreground')}>
                    {exceedsCredit
                      ? `This exceeds the customer's approved credit limit of ${formatCurrency(walletBalance?.creditLimit ?? 0)}.`
                      : 'This will put the customer on account (approved credit).'}
                  </p>
                )}
              </div>
            )
          })()}

          {paymentMethod !== 'PAYSTACK' && (
            <div>
              <Label>Bill Split</Label>
              <div className="mt-1 flex flex-wrap gap-2">
                {(
                  [
                    { value: 'full', label: 'Full Amount' },
                    { value: 'even', label: 'Split Evenly' },
                    { value: 'custom', label: 'Custom Amount' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setSplitMode(m.value)}
                    className={cn(
                      'shrink-0 cursor-pointer rounded-full px-4 py-2 text-sm font-medium',
                      splitMode === m.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              {splitMode === 'even' && (
                <div className="mt-2 flex items-center justify-between rounded-xl border border-border p-3">
                  <span className="text-sm text-muted-foreground">Number of ways</span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setEvenWays((w) => Math.max(2, w - 1))}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-muted font-bold text-foreground"
                    >
                      −
                    </button>
                    <span className="w-6 text-center font-semibold text-foreground">{evenWays}</span>
                    <button
                      type="button"
                      onClick={() => setEvenWays((w) => w + 1)}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-muted font-bold text-foreground"
                    >
                      +
                    </button>
                  </div>
                </div>
              )}
              {splitMode === 'custom' && (
                <Input
                  type="number"
                  step="0.01"
                  className="mt-2"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  placeholder={`Up to ${formatCurrency(remainingBalance)}`}
                />
              )}
            </div>
          )}

          <div className="rounded-xl bg-muted p-4 text-center">
            {amountPaidSoFar > 0 && (
              <div className="mb-2 flex justify-between border-b border-border pb-2 text-sm text-muted-foreground">
                <span>Already Paid</span>
                <span className="font-semibold text-foreground">{formatCurrency(amountPaidSoFar)}</span>
              </div>
            )}
            <div className="text-sm text-muted-foreground">
              {splitMode === 'full' ? 'Amount Due' : 'Amount Due Now'}
            </div>
            <div className="text-2xl font-bold text-foreground">{formatCurrency(paymentAmount)}</div>
            {splitMode !== 'full' && paymentAmount < remainingBalance - 0.01 && (
              <div className="mt-1 text-xs text-muted-foreground">
                {formatCurrency(remainingBalance - paymentAmount)} will remain after this
              </div>
            )}
          </div>
          <Button
            className="w-full"
            isLoading={closeOrder.isPending}
            disabled={
              (paymentMethod === 'PAYSTACK' && !customerEmail) ||
              (paymentMethod === 'OTHER' && !otherPaymentNote.trim()) ||
              (paymentMethod === 'WALLET' &&
                !!walletBalance &&
                walletBalance.balance - paymentAmount < -walletBalance.creditLimit) ||
              (paymentMethod !== 'PAYSTACK' && (paymentAmount <= 0 || paymentAmount > remainingBalance + 0.01))
            }
            onClick={() => closeOrder.mutate()}
          >
            {paymentMethod === 'PAYSTACK'
              ? 'Generate Checkout Link'
              : paymentAmount >= remainingBalance - 0.01
                ? 'Confirm Payment & Close'
                : 'Record Payment'}
          </Button>
        </div>
      </Modal>

      <Modal isOpen={customerModalOpen} onClose={() => setCustomerModalOpen(false)} title="Attach Customer">
        <div className="space-y-4">
          <div>
            <Label>Customer</Label>
            <SearchableSelect
              options={customerOptions}
              value={selectedCustomerId}
              onChange={setSelectedCustomerId}
              placeholder="Search customers"
            />
          </div>
          <div className="flex gap-3">
            {order.customer && (
              <Button
                variant="outline"
                className="flex-1"
                isLoading={setCustomer.isPending}
                onClick={() => setCustomer.mutate(null)}
              >
                Clear
              </Button>
            )}
            <Button
              className="flex-1"
              disabled={!selectedCustomerId}
              isLoading={setCustomer.isPending}
              onClick={() => setCustomer.mutate(selectedCustomerId)}
            >
              Save
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={waiterModalOpen} onClose={() => setWaiterModalOpen(false)} title="Assign Waiter">
        <div className="space-y-4">
          <div>
            <Label>Waiter</Label>
            <SearchableSelect
              options={waiterOptions}
              value={selectedWaiterId}
              onChange={setSelectedWaiterId}
              placeholder="Search waiters"
            />
          </div>
          <div className="flex gap-3">
            {order.waiter && (
              <Button
                variant="outline"
                className="flex-1"
                isLoading={setWaiter.isPending}
                onClick={() => setWaiter.mutate(null)}
              >
                Clear
              </Button>
            )}
            <Button
              className="flex-1"
              disabled={!selectedWaiterId}
              isLoading={setWaiter.isPending}
              onClick={() => setWaiter.mutate(selectedWaiterId)}
            >
              Save
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={notesModalOpen} onClose={() => setNotesModalOpen(false)} title="Order Notes">
        <div className="space-y-4">
          <div>
            <Label>Notes</Label>
            <Textarea
              value={selectedNotes}
              onChange={(e) => setSelectedNotes(e.target.value)}
              placeholder="Add a note for this order (e.g. birthday, allergy, special request)"
              className="mt-1 text-sm"
              rows={3}
            />
          </div>
          <div className="flex gap-3">
            {order.notes && (
              <Button
                variant="outline"
                className="flex-1"
                isLoading={setNotes.isPending}
                onClick={() => setNotes.mutate('')}
              >
                Clear
              </Button>
            )}
            <Button
              className="flex-1"
              isLoading={setNotes.isPending}
              onClick={() => setNotes.mutate(selectedNotes)}
            >
              Save
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={discountModalOpen} onClose={() => setDiscountModalOpen(false)} title="Apply Discount">
        <div className="space-y-4">
          <div>
            <Label>Discount Type</Label>
            <div className="mt-1 flex gap-2">
              {(
                [
                  { value: 'PERCENTAGE', label: 'Percentage' },
                  { value: 'FIXED', label: 'Fixed Amount' },
                ] as const
              ).map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setDiscountType(t.value)}
                  className={cn(
                    'shrink-0 cursor-pointer rounded-full px-4 py-2 text-sm font-medium',
                    discountType === t.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>{discountType === 'PERCENTAGE' ? 'Percentage (%)' : `Amount (up to ${formatCurrency(order.subtotal)})`}</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              max={discountType === 'PERCENTAGE' ? 100 : order.subtotal}
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
            />
          </div>
          <div>
            <Label>Reason (required)</Label>
            <Input
              value={discountReason}
              onChange={(e) => setDiscountReason(e.target.value)}
              placeholder="e.g. Loyalty customer, manager comp"
            />
          </div>
          <Button
            className="w-full"
            isLoading={applyDiscount.isPending}
            disabled={!discountValue || Number(discountValue) < 0 || !discountReason.trim()}
            onClick={() => applyDiscount.mutate({ discountType, value: Number(discountValue), reason: discountReason.trim() })}
          >
            Apply Discount
          </Button>
        </div>
      </Modal>

      <Modal isOpen={sourceModalOpen} onClose={() => setSourceModalOpen(false)} title="Change Order Type">
        <div className="space-y-4">
          <div>
            <Label>Order Type</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {sortedOrderTypes.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedSource(t.name)}
                  className={cn(
                    'shrink-0 cursor-pointer rounded-full px-4 py-2 text-sm font-medium',
                    selectedSource === t.name ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>
          {selectedSourceRequiresTable && (
            <div>
              <Label>Table</Label>
              <SearchableSelect
                options={availableTableOptions}
                value={selectedSourceTableId}
                onChange={setSelectedSourceTableId}
                placeholder="Search tables"
              />
            </div>
          )}
          <Button
            className="w-full"
            disabled={selectedSourceRequiresTable && !selectedSourceTableId}
            isLoading={setSource.isPending}
            onClick={() => setSource.mutate()}
          >
            Save
          </Button>
        </div>
      </Modal>

      <Modal isOpen={mergeModalOpen} onClose={() => setMergeModalOpen(false)} title="Merge Another Order In">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Pick another open, unpaid order to fold into this bill. Its items move here and it gets cancelled —
            table occupancy is unaffected either way.
          </p>
          {mergeableOrders.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No other open orders to merge.</p>
          ) : (
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {mergeableOrders.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => mergeOrder.mutate(o.id)}
                  disabled={mergeOrder.isPending}
                  className="flex w-full items-center justify-between rounded-xl border border-border p-3 text-left hover:bg-muted/50 disabled:opacity-50"
                >
                  <div>
                    <div className="font-semibold text-foreground">{o.table?.name ?? o.source}</div>
                    <div className="text-xs text-muted-foreground">{o.items.length} item{o.items.length === 1 ? '' : 's'}</div>
                  </div>
                  <span className="font-semibold text-foreground">{formatCurrency(o.total)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </Modal>

      <Modal isOpen={moveModalOpen} onClose={() => setMoveModalOpen(false)} title="Move Selected Items">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Moving {selectedItemIds.size} item{selectedItemIds.size === 1 ? '' : 's'} off this order. The rest of
            this order is untouched — if you move everything, this order is cancelled.
          </p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { value: 'new', label: 'New Order' },
                { value: 'existing', label: 'Existing Order' },
              ] as const
            ).map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMoveMode(m.value)}
                className={cn(
                  'shrink-0 cursor-pointer rounded-full px-4 py-2 text-sm font-medium',
                  moveMode === m.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          {moveMode === 'new' ? (
            <div>
              <Label>Table (optional — defaults to this order's table)</Label>
              <SearchableSelect
                options={availableTableOptions}
                value={moveTableId}
                onChange={setMoveTableId}
                placeholder="Search tables"
              />
            </div>
          ) : mergeableOrders.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No other open orders to move items onto.</p>
          ) : (
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {mergeableOrders.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setMoveDestinationOrderId(o.id)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-xl border p-3 text-left',
                    moveDestinationOrderId === o.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
                  )}
                >
                  <div>
                    <div className="font-semibold text-foreground">{o.table?.name ?? o.source}</div>
                    <div className="text-xs text-muted-foreground">{o.items.length} item{o.items.length === 1 ? '' : 's'}</div>
                  </div>
                  <span className="font-semibold text-foreground">{formatCurrency(o.total)}</span>
                </button>
              ))}
            </div>
          )}

          <Button
            className="w-full"
            isLoading={moveItems.isPending}
            disabled={moveMode === 'existing' && !moveDestinationOrderId}
            onClick={() => moveItems.mutate()}
          >
            Move Items
          </Button>
        </div>
      </Modal>
    </div>
  )
}

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  if (!id) return null
  if (id.startsWith(LOCAL_ORDER_PREFIX)) {
    return <PendingOrderView localOrderId={id} />
  }
  return <SyncedOrderView id={id} />
}
