import { Fragment, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Timer } from 'lucide-react'
import { Header } from '@/components/layout'
import { Card, CardContent, Badge } from '@/components/ui'
import { ordersApi } from '@/api'
import { cn } from '@/lib/utils'
import type { Order, OrderItemStatus, OrderStatus } from '@/types'

const ACTIVE_STATUSES: OrderStatus[] = ['OPEN', 'IN_KITCHEN', 'READY']
const ITEM_STATUS_FLOW: OrderItemStatus[] = ['PENDING', 'ON_IT', 'PASS', 'SERVED']
const ITEM_STATUS_LABELS: Record<OrderItemStatus, string> = {
  PENDING: 'Pending',
  ON_IT: 'On It',
  PASS: 'Pass',
  SERVED: 'Served',
}

const SOURCE_LABELS: Record<Order['source'], string> = {
  DINE_IN: 'Dine In',
  TAKEAWAY: 'Take Out',
  DELIVERY: 'Delivery',
  THIRD_PARTY: 'Third Party',
}

const URGENT_THRESHOLD_MS = 3 * 60_000

function orderMaxDurationMinutes(order: Order): number | null {
  const durations = order.items
    .map((i) => i.menuItem?.durationMinutes)
    .filter((d): d is number => typeof d === 'number')
  if (durations.length === 0) return null
  return Math.max(...durations)
}

function CountdownTimer({ order, now }: { order: Order; now: number }) {
  const maxMinutes = orderMaxDurationMinutes(order)
  if (maxMinutes === null) {
    return <span className="text-xs font-semibold text-muted-foreground">No timer set</span>
  }
  const deadline = new Date(order.createdAt).getTime() + maxMinutes * 60_000
  const remainingMs = deadline - now
  const overdue = remainingMs < 0
  const urgent = !overdue && remainingMs <= URGENT_THRESHOLD_MS
  const absSeconds = Math.floor(Math.abs(remainingMs) / 1000)
  const mm = String(Math.floor(absSeconds / 60)).padStart(2, '0')
  const ss = String(absSeconds % 60).padStart(2, '0')

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-full px-3 py-1 text-base font-bold tabular-nums',
        overdue && 'bg-destructive/10 text-destructive',
        urgent && 'bg-amber-500/10 text-amber-600',
        !overdue && !urgent && 'bg-primary/10 text-primary',
      )}
    >
      <Timer className="h-4 w-4" />
      {overdue ? '-' : ''}
      {mm}:{ss}
    </div>
  )
}

function TicketCard({ order, now }: { order: Order; now: number }) {
  const queryClient = useQueryClient()

  const updateItemStatus = useMutation({
    mutationFn: ({ itemId, status }: { itemId: string; status: OrderItemStatus }) =>
      ordersApi.updateItemStatus(order.id, itemId, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kitchen-orders'] }),
    onError: () => toast.error('Failed to update item status'),
  })

  const waiterOrTable = [order.waiter?.name, order.table?.name].filter(Boolean).join(' · ') || '—'

  return (
    <Card className="w-full overflow-hidden p-0">
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start">
        {/* Items + their notes, paired row-by-row so they never drift out of alignment */}
        <div className="grid flex-none grid-cols-[minmax(0,auto)_minmax(0,auto)] items-center gap-x-8 gap-y-3">
          {order.items.map((item) => (
            <Fragment key={item.id}>
              <div>
                <div className="text-sm font-semibold text-foreground">
                  {item.quantity}x {item.menuItem?.name ?? item.itemName}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {ITEM_STATUS_FLOW.map((s) => (
                    <button
                      key={s}
                      onClick={() => updateItemStatus.mutate({ itemId: item.id, status: s })}
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-medium',
                        item.status === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {ITEM_STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                {item.notes || <span className="opacity-40">—</span>}
              </div>
            </Fragment>
          ))}
        </div>

        {/* Timer / order type / waiter+table, anchored to the right */}
        <div className="flex flex-row items-center gap-3 border-t border-border pt-3 sm:ml-auto sm:flex-col sm:items-end sm:gap-2 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0 sm:text-right">
          <CountdownTimer order={order} now={now} />
          <Badge variant="default">{SOURCE_LABELS[order.source]}</Badge>
          <div className="text-xs font-semibold text-muted-foreground">{waiterOrTable}</div>
        </div>
      </CardContent>
    </Card>
  )
}

export function KitchenTicketsPage() {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(interval)
  }, [])

  // One request covering all three active statuses — not three separate polled requests, which
  // burned through the backend's shared per-IP rate limit (60 req/min, across the whole API)
  // on its own and caused repeated 429s.
  const { data, isLoading } = useQuery({
    queryKey: ['kitchen-orders', ACTIVE_STATUSES],
    queryFn: () => ordersApi.list({ statuses: ACTIVE_STATUSES, limit: 100 }),
    refetchInterval: 5_000,
  })

  const orders = useMemo(() => {
    const merged = data?.data ?? []
    return [...merged].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  }, [data])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title="Kitchen" description="Active orders, in preparation order" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : orders.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">No active orders</p>
        ) : (
          <div className="flex flex-col gap-4">
            {orders.map((order) => (
              <TicketCard key={order.id} order={order} now={now} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
