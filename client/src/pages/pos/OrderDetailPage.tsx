import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Download, Plus, X, UserPlus, Pencil } from 'lucide-react'
import { Header } from '@/components/layout'
import { Button, Card, CardContent, Badge, Input, Label, SearchableSelect } from '@/components/ui'
import { Modal } from '@/components/shared/Modal'
import { ordersApi, menuCategoriesApi, menuItemsApi, customersApi, walletApi, waitersApi } from '@/api'
import { getQueuedActionsForLocalOrder, discardFailedAction, LOCAL_ORDER_PREFIX } from '@/lib/offlineOrderQueue'
import { formatCurrency, cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth'
import type { OrderItemStatus, MenuItem } from '@/types'
import type { CreateOrderItemData } from '@/api/orders'

// Matches the backend's @Roles list on POST /orders/:id/close — only these roles can accept payment.
const PAYMENT_CAPABLE_ROLES = ['STAFF', 'ACCOUNTANT', 'CASHIER', 'ADMIN', 'SUPER_ADMIN']
// Matches the backend's @Roles list on POST /orders/:id/cancel.
const VOID_CAPABLE_ROLES = ['STAFF', 'ACCOUNTANT', 'SUPERVISOR', 'MANAGER', 'ADMIN', 'SUPER_ADMIN']

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

  const visibleItems = useMemo(() => {
    if (!items) return []
    const available = items.filter((i) => i.isAvailable)
    return activeCategory === 'all' ? available : available.filter((i) => i.categories.some((c) => c.id === activeCategory))
  }, [items, activeCategory])

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
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Items">
      <div className="max-h-[70vh] space-y-4 overflow-y-auto">
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
  const canAcceptPayment = !!currentUser && PAYMENT_CAPABLE_ROLES.includes(currentUser.role)
  const canVoid = !!currentUser && VOID_CAPABLE_ROLES.includes(currentUser.role)
  const [addItemsOpen, setAddItemsOpen] = useState(false)
  const [closeModalOpen, setCloseModalOpen] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<(typeof PAYMENT_METHODS)[number]['value']>('CASH')
  const [customerEmail, setCustomerEmail] = useState('')
  const [otherPaymentNote, setOtherPaymentNote] = useState('')
  const [customerModalOpen, setCustomerModalOpen] = useState(false)
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [waiterModalOpen, setWaiterModalOpen] = useState(false)
  const [selectedWaiterId, setSelectedWaiterId] = useState('')

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => ordersApi.get(id),
    refetchInterval: 10_000,
  })

  const { data: walletBalance } = useQuery({
    queryKey: ['wallet-balance', order?.customer?.id],
    queryFn: () => walletApi.getBalance(order!.customer!.id),
    enabled: closeModalOpen && !!order?.customer,
  })

  const { data: customersPage } = useQuery({
    queryKey: ['customers', { limit: 100 }],
    queryFn: () => customersApi.list({ limit: 100 }),
    enabled: customerModalOpen,
  })
  const customerOptions = useMemo(
    () => (customersPage?.data ?? []).map((c) => ({ id: c.id, label: `${c.name} (${c.phone})` })),
    [customersPage],
  )

  const setCustomer = useMutation({
    mutationFn: (customerId: string | null) => ordersApi.setCustomer(id, customerId),
    onSuccess: () => {
      toast.success('Customer updated')
      setCustomerModalOpen(false)
      queryClient.invalidateQueries({ queryKey: ['order', id] })
      queryClient.invalidateQueries({ queryKey: ['customers'] })
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(message || 'Failed to update customer')
    },
  })

  const { data: waiters } = useQuery({
    queryKey: ['waiters'],
    queryFn: () => waitersApi.list(),
    enabled: waiterModalOpen,
  })
  const waiterOptions = useMemo(
    () => (waiters ?? []).filter((w) => w.isActive).map((w) => ({ id: w.id, label: w.name })),
    [waiters],
  )

  const setWaiter = useMutation({
    mutationFn: (waiterId: string | null) => ordersApi.setWaiter(id, waiterId),
    onSuccess: () => {
      toast.success('Waiter updated')
      setWaiterModalOpen(false)
      queryClient.invalidateQueries({ queryKey: ['order', id] })
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(message || 'Failed to update waiter')
    },
  })

  const updateItemStatus = useMutation({
    mutationFn: ({ itemId, status }: { itemId: string; status: OrderItemStatus }) =>
      ordersApi.updateItemStatus(id, itemId, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['order', id] }),
    onError: () => toast.error('Failed to update item status'),
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
      navigate('/pos/tables')
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(message || 'Failed to cancel order')
    },
  })

  const markAwaitingPayment = useMutation({
    mutationFn: () => ordersApi.markAwaitingPayment(id),
    onSuccess: () => {
      toast.success('Order marked ready — a cashier can now take payment')
      queryClient.invalidateQueries({ queryKey: ['order', id] })
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(message || 'Failed to mark order ready for payment')
    },
  })

  const closeOrder = useMutation({
    mutationFn: async () => {
      if (paymentMethod === 'PAYSTACK') {
        return ordersApi.paystackCheckout(id, { paymentMethod, customerEmail })
      }
      return ordersApi.close(id, { paymentMethod, notes: paymentMethod === 'OTHER' ? otherPaymentNote : undefined })
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
      toast.success('Order closed')
      if (order?.customerId) {
        queryClient.invalidateQueries({ queryKey: ['customers'] })
        queryClient.invalidateQueries({ queryKey: ['wallet-balance', order.customerId] })
        queryClient.invalidateQueries({ queryKey: ['wallet-transactions', order.customerId] })
      }
      setCloseModalOpen(false)
      queryClient.invalidateQueries({ queryKey: ['order', id] })
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
          {isOpenStatus && (
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => setAddItemsOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Add Items
            </Button>
          )}
        </div>

        <div className="mb-4 flex items-center justify-between rounded-xl border border-border p-3">
          {order.customer ? (
            <Link to={`/pos/customers/${order.customer.id}`} className="text-sm font-medium text-foreground hover:underline">
              {order.customer.name} · {order.customer.phone}
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
            <span className="text-sm font-medium text-foreground">{order.waiter.name}</span>
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

        <div className="space-y-3">
          {order.items.map((item) => (
            <Card key={item.id} className="p-4">
              <CardContent className="p-0">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-foreground">
                      {item.quantity}x {item.menuItem?.name ?? item.itemName}
                    </div>
                    {item.notes && <div className="text-xs text-muted-foreground">{item.notes}</div>}
                  </div>
                  <div className="font-semibold text-foreground">{formatCurrency(item.amount)}</div>
                </div>
                {isOpenStatus && (
                  <div className="mt-3 flex gap-2">
                    {ITEM_STATUS_FLOW.map((s) => (
                      <button
                        key={s}
                        onClick={() => updateItemStatus.mutate({ itemId: item.id, status: s })}
                        className={cn(
                          'rounded-full px-3 py-1 text-xs font-medium',
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
            {order.taxAmount > 0 && (
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Tax</span>
                <span>{formatCurrency(order.taxAmount)}</span>
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
          <div>
            <Label>Payment Method</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {(order.customer ? PAYMENT_METHODS : PAYMENT_METHODS.filter((m) => m.value !== 'WALLET')).map((m) => (
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
            const balanceAfter = walletBalance ? walletBalance.balance - order.total : undefined
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
          <div className="rounded-xl bg-muted p-4 text-center">
            <div className="text-sm text-muted-foreground">Amount Due</div>
            <div className="text-2xl font-bold text-foreground">{formatCurrency(order.total)}</div>
          </div>
          <Button
            className="w-full"
            isLoading={closeOrder.isPending}
            disabled={
              (paymentMethod === 'PAYSTACK' && !customerEmail) ||
              (paymentMethod === 'OTHER' && !otherPaymentNote.trim()) ||
              (paymentMethod === 'WALLET' &&
                !!walletBalance &&
                walletBalance.balance - order.total < -walletBalance.creditLimit)
            }
            onClick={() => closeOrder.mutate()}
          >
            {paymentMethod === 'PAYSTACK' ? 'Generate Checkout Link' : 'Confirm Payment & Close'}
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
