import { Fragment, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Timer } from 'lucide-react'
import { Header } from '@/components/layout'
import { Card, CardContent, Badge } from '@/components/ui'
import { ordersApi } from '@/api'
import { cn } from '@/lib/utils'
import type { Order, OrderItem, OrderItemStatus, OrderStatus } from '@/types'

const ACTIVE_STATUSES: OrderStatus[] = ['OPEN', 'IN_KITCHEN', 'READY']
const ITEM_STATUS_FLOW: OrderItemStatus[] = ['PENDING', 'ON_IT', 'PASS', 'SERVED']
const ITEM_STATUS_LABELS: Record<OrderItemStatus, string> = {
  PENDING: 'Pending',
  ON_IT: 'On It',
  PASS: 'Pass',
  SERVED: 'Served',
}

const URGENT_THRESHOLD_MS = 3 * 60_000

export type Station = 'KITCHEN' | 'BAR'

// An item routes to the bar only if one of its categories is explicitly tagged DRINK. Everything
// else — FOOD, OTHER, and items with no category at all — defaults to the kitchen, since an
// uncategorized item is far more likely to be food than a drink someone forgot to tag.
function itemStation(item: OrderItem): Station {
  const isDrink = item.menuItem?.categories.some((c) => c.category.kind === 'DRINK') ?? false
  return isDrink ? 'BAR' : 'KITCHEN'
}

function orderMaxDurationMinutes(items: OrderItem[]): number | null {
  const durations = items.map((i) => i.menuItem?.durationMinutes).filter((d): d is number => typeof d === 'number')
  if (durations.length === 0) return null
  return Math.max(...durations)
}

function CountdownTimer({ order, items, now }: { order: Order; items: OrderItem[]; now: number }) {
  const maxMinutes = orderMaxDurationMinutes(items)
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

function TicketCard({ order, items, now }: { order: Order; items: OrderItem[]; now: number }) {
  const queryClient = useQueryClient()

  const updateItemStatus = useMutation({
    mutationFn: ({ itemId, status }: { itemId: string; status: OrderItemStatus }) =>
      ordersApi.updateItemStatus(order.id, itemId, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kitchen-orders'] }),
    onError: () => toast.error('Failed to update item status'),
  })

  const waiterName = order.waiter ? `${order.waiter.firstName} ${order.waiter.lastName}` : undefined
  const waiterOrTable = [waiterName, order.table?.name].filter(Boolean).join(' · ') || '—'

  return (
    <Card className="w-full overflow-hidden p-0">
      <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start">
        {/* Items + their notes, paired row-by-row so they never drift out of alignment */}
        <div className="grid flex-none grid-cols-[minmax(0,auto)_minmax(0,auto)] items-center gap-x-8 gap-y-6">
          {items.map((item) => {
            // The PATCH this fires can take a while, and with no feedback a tap that hasn't
            // resolved yet just looks like it didn't register — so disable this item's buttons
            // and spin the one that was tapped until the request settles either way.
            const pendingStatus =
              updateItemStatus.isPending && updateItemStatus.variables?.itemId === item.id
                ? updateItemStatus.variables.status
                : null

            return (
              <Fragment key={item.id}>
                <div>
                  <div className="text-base font-bold text-foreground">
                    {item.quantity}x {item.menuItem?.name ?? item.itemName}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {ITEM_STATUS_FLOW.map((s) => (
                      <button
                        key={s}
                        onClick={() => updateItemStatus.mutate({ itemId: item.id, status: s })}
                        disabled={pendingStatus !== null}
                        className={cn(
                          'flex min-h-16 min-w-24 cursor-pointer items-center justify-center gap-2 rounded-2xl px-6 py-4 text-lg font-bold transition-colors active:scale-95 disabled:cursor-not-allowed',
                          item.status === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                          pendingStatus !== null && pendingStatus !== s && 'opacity-40',
                        )}
                      >
                        {pendingStatus === s && (
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        )}
                        {ITEM_STATUS_LABELS[s]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="text-base text-muted-foreground">
                  {item.notes || <span className="opacity-40">—</span>}
                </div>
              </Fragment>
            )
          })}
        </div>

        {/* Timer / order type / waiter+table, anchored to the right */}
        <div className="flex flex-row items-center gap-3 border-t border-border pt-3 sm:ml-auto sm:flex-col sm:items-end sm:gap-2 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0 sm:text-right">
          <CountdownTimer order={order} items={items} now={now} />
          <Badge variant="default">{order.source}</Badge>
          <div className="text-xs font-semibold text-muted-foreground">{waiterOrTable}</div>
        </div>
      </CardContent>
    </Card>
  )
}

export function StationTicketsPage({
  station,
  title,
  description,
}: {
  station: Station
  title: string
  description: string
}) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(interval)
  }, [])

  // One request covering all three active statuses — not three separate polled requests, which
  // burned through the backend's shared per-IP rate limit (60 req/min, across the whole API)
  // on its own and caused repeated 429s.
  const { data, isLoading } = useQuery({
    queryKey: ['kitchen-orders', ACTIVE_STATUSES, station],
    queryFn: () => ordersApi.list({ statuses: ACTIVE_STATUSES, limit: 100 }),
    refetchInterval: 5_000,
  })

  const tickets = useMemo(() => {
    const merged = data?.data ?? []
    return merged
      .map((order) => ({ order, items: order.items.filter((item) => itemStation(item) === station) }))
      .filter((t) => t.items.length > 0)
      .sort((a, b) => new Date(a.order.createdAt).getTime() - new Date(b.order.createdAt).getTime())
  }, [data, station])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title={title} description={description} />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : tickets.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">No active orders</p>
        ) : (
          <div className="flex flex-col gap-4">
            {tickets.map(({ order, items }) => (
              <TicketCard key={order.id} order={order} items={items} now={now} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
