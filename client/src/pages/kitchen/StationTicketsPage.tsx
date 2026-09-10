import { Fragment, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Timer, UserRoundPlus } from 'lucide-react'
import { Header } from '@/components/layout'
import { Card, CardContent, Badge, DropdownPanel } from '@/components/ui'
import { ordersApi, usersApi } from '@/api'
import { cn } from '@/lib/utils'
import type { Order, OrderItem, OrderItemStatus, OrderStatus, UserRole } from '@/types'

// Any active staff member can be assigned to an item — there's no dedicated "chef"/"barman"
// role, so this covers every role that could plausibly be on a kitchen or bar shift.
const ASSIGNABLE_ROLES: UserRole[] = [
  'STAFF',
  'MANAGER',
  'SUPERVISOR',
  'CASHIER',
  'WAITER',
  'PASS',
  'RUNNER',
]

const ACTIVE_STATUSES: OrderStatus[] = ['OPEN', 'IN_KITCHEN', 'READY']
const ITEM_STATUS_FLOW: OrderItemStatus[] = ['PENDING', 'ON_IT', 'PASS', 'SERVED']
const ITEM_STATUS_LABELS: Record<OrderItemStatus, string> = {
  PENDING: 'Pending',
  ON_IT: 'On It',
  PASS: 'Pass',
  SERVED: 'Served',
}

const URGENT_THRESHOLD_MS = 3 * 60_000

export type Station = 'KITCHEN' | 'DRINKS'

// An item routes to Drinks only if one of its categories is explicitly tagged DRINK. Everything
// else — FOOD, OTHER, and items with no category at all — defaults to the kitchen, since an
// uncategorized item is far more likely to be food than a drink someone forgot to tag.
function itemStation(item: OrderItem): Station {
  const isDrink = item.menuItem?.categories.some((c) => c.category.kind === 'DRINK') ?? false
  return isDrink ? 'DRINKS' : 'KITCHEN'
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

function getInitials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase()
}

// A single tap opens the picker, a single tap on a name assigns and closes it — this is meant
// for an expo/manager to fly through a whole board of items assigning staff, not for the
// assignee to self-serve, so it deliberately has no confirmation step.
function AssigneeChip({ orderId, item }: { orderId: string; item: OrderItem }) {
  const [isOpen, setIsOpen] = useState(false)
  const queryClient = useQueryClient()

  const { data: staff } = useQuery({
    queryKey: ['staff-directory', ASSIGNABLE_ROLES],
    queryFn: () => usersApi.directory(ASSIGNABLE_ROLES),
    enabled: isOpen,
    staleTime: 60_000,
  })

  const updateAssignee = useMutation({
    mutationFn: (assignedToId: string | null) => ordersApi.updateItemAssignee(orderId, item.id, assignedToId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kitchen-orders'] }),
    onError: () => toast.error('Failed to assign'),
  })

  return (
    <div className="relative mt-3 inline-block">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className={cn(
          'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors',
          item.assignedTo ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
        )}
      >
        {item.assignedTo ? (
          <>
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
              {getInitials(item.assignedTo.firstName, item.assignedTo.lastName)}
            </span>
            {item.assignedTo.firstName}
          </>
        ) : (
          <>
            <UserRoundPlus className="h-3.5 w-3.5" />
            Assign
          </>
        )}
      </button>

      <DropdownPanel isOpen={isOpen} onClose={() => setIsOpen(false)} align="left" widthClass="w-52">
        {!staff ? (
          <div className="px-3 py-2 text-sm text-muted-foreground">Loading…</div>
        ) : staff.length === 0 ? (
          <div className="px-3 py-2 text-sm text-muted-foreground">No staff found</div>
        ) : (
          <>
            {staff.map((person) => (
              <button
                key={person.id}
                type="button"
                onClick={() => {
                  updateAssignee.mutate(person.id)
                  setIsOpen(false)
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted',
                  item.assignedToId === person.id && 'font-semibold text-primary',
                )}
              >
                {person.firstName} {person.lastName}
              </button>
            ))}
            {item.assignedToId && (
              <button
                type="button"
                onClick={() => {
                  updateAssignee.mutate(null)
                  setIsOpen(false)
                }}
                className="mt-1 flex w-full items-center gap-2 rounded-lg border-t border-border px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted"
              >
                Clear assignment
              </button>
            )}
          </>
        )}
      </DropdownPanel>
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
  const placedAt = new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

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
                  <AssigneeChip orderId={order.id} item={item} />
                </div>
                <div
                  className={cn(
                    'text-base',
                    item.notes ? 'font-bold text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
                  )}
                >
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
          <div className="text-xs text-muted-foreground">Placed {placedAt}</div>
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
