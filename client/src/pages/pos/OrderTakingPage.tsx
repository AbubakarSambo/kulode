import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Minus, Plus, ArrowLeft } from 'lucide-react'
import { Header } from '@/components/layout'
import { Button, Card, CardContent, Select, Textarea, Label } from '@/components/ui'
import { menuCategoriesApi, menuItemsApi, ordersApi } from '@/api'
import { formatCurrency, cn } from '@/lib/utils'
import type { OrderSource } from '@/types'

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

  const [source, setSource] = useState<OrderSource>(initialSource)
  const [activeCategory, setActiveCategory] = useState<string | 'all'>('all')
  const [cart, setCart] = useState<CartLine[]>([])
  const [notes, setNotes] = useState('')

  const { data: categories } = useQuery({ queryKey: ['menu-categories'], queryFn: () => menuCategoriesApi.list() })
  const { data: items } = useQuery({ queryKey: ['menu-items'], queryFn: () => menuItemsApi.list() })

  const visibleItems = useMemo(() => {
    if (!items) return []
    const available = items.filter((i) => i.isAvailable)
    return activeCategory === 'all' ? available : available.filter((i) => i.categoryId === activeCategory)
  }, [items, activeCategory])

  const total = cart.reduce((sum, line) => sum + line.price * line.quantity, 0)

  const addToCart = (menuItemId: string, name: string, price: number) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.menuItemId === menuItemId)
      if (existing) {
        return prev.map((l) => (l.menuItemId === menuItemId ? { ...l, quantity: l.quantity + 1 } : l))
      }
      return [...prev, { menuItemId, name, price, quantity: 1 }]
    })
  }

  const updateQuantity = (menuItemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) => (l.menuItemId === menuItemId ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0),
    )
  }

  const createOrder = useMutation({
    mutationFn: () =>
      ordersApi.create({
        tableId,
        source,
        notes: notes || undefined,
        items: cart.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity })),
      }),
    onSuccess: (result) => {
      if ('__offlinePending' in result) {
        toast.success('No connection — order saved and will sync automatically', { duration: 4000 })
        navigate('/pos/tables')
        return
      }
      toast.success('Order sent')
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
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
          </Button>
        }
      />

      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {!tableId && (
            <div className="mb-4">
              <Label>Order Type</Label>
              <Select value={source} onChange={(e) => setSource(e.target.value as OrderSource)}>
                {(Object.keys(SOURCE_LABELS) as OrderSource[])
                  .filter((s) => s !== 'DINE_IN')
                  .map((s) => (
                    <option key={s} value={s}>{SOURCE_LABELS[s]}</option>
                  ))}
              </Select>
            </div>
          )}

          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setActiveCategory('all')}
              className={cn(
                'shrink-0 rounded-full px-4 py-2 text-sm font-medium',
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
                  'shrink-0 rounded-full px-4 py-2 text-sm font-medium',
                  activeCategory === cat.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                )}
              >
                {cat.name}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {visibleItems.map((item) => (
              <button
                key={item.id}
                onClick={() => addToCart(item.id, item.name, item.price)}
                className="rounded-2xl border border-border bg-card p-4 text-left shadow-[0px_12px_32px_rgba(0,55,176,0.08)] transition-all active:scale-95"
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
              <div key={line.menuItemId} className="flex items-center justify-between gap-2">
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
            ))}
          </div>

          <div className="mt-4">
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any special requests" />
          </div>

          <Card className="mt-4 p-4">
            <CardContent className="flex items-center justify-between p-0">
              <span className="font-semibold text-muted-foreground">Total</span>
              <span className="text-xl font-bold text-foreground">{formatCurrency(total)}</span>
            </CardContent>
          </Card>

          <Button
            className="mt-4 h-14 text-base"
            disabled={cart.length === 0}
            isLoading={createOrder.isPending}
            onClick={() => createOrder.mutate()}
          >
            Send Order
          </Button>
        </div>
      </div>
    </div>
  )
}
