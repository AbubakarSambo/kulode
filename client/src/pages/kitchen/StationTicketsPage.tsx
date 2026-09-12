import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Timer, ChefHat, X, Bell, BellOff } from 'lucide-react'
import { Header } from '@/components/layout'
import { Card, CardContent, Badge } from '@/components/ui'
import { ordersApi, usersApi } from '@/api'
import { cn } from '@/lib/utils'
import { createOrderChimeContext, playOrderChime } from '@/lib/orderChime'
import type { Order, OrderItem, OrderItemStatus, OrderStatus, UserRole } from '@/types'

// Only staff actually tagged Kitchen can be assigned to make an item — distinct from PASS/RUNNER,
// who ferry tickets/food but aren't necessarily the one cooking/mixing it.
const ASSIGNABLE_ROLES: UserRole[] = ['KITCHEN']

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
  // Once every item on the ticket is actually Served, freeze the clock at the moment the last
  // one was — the order itself stays on the board (rolled up to READY) until it's closed/paid,
  // so without this the timer would otherwise keep counting against wall-clock time forever.
  const allServed = items.length > 0 && items.every((i) => i.status === 'SERVED')
  const effectiveNow = allServed
    ? Math.max(...items.map((i) => (i.servedAt ? new Date(i.servedAt).getTime() : now)))
    : now
  const deadline = new Date(order.createdAt).getTime() + maxMinutes * 60_000
  const remainingMs = deadline - effectiveNow
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

// What the assignment modal is currently doing for a given item:
// - 'required': gating the Pending → On It transition. Picking someone assigns AND advances the
//   status in one go; closing without picking aborts the whole transition (item stays Pending).
// - 'reassign': reopened by tapping an already-assigned item's name. Picking someone just updates
//   the assignee; the item's status is untouched. Closing without picking changes nothing.
type AssignmentFlow = { item: OrderItem; mode: 'required' | 'reassign' }

function AssignStaffModal({
  flow,
  onClose,
  onSelect,
  isSubmitting,
}: {
  flow: AssignmentFlow | null
  onClose: () => void
  onSelect: (staffId: string) => void
  isSubmitting: boolean
}) {
  const { data: staff, isLoading } = useQuery({
    queryKey: ['staff-directory', ASSIGNABLE_ROLES],
    queryFn: () => usersApi.directory(ASSIGNABLE_ROLES),
    enabled: !!flow,
    staleTime: 60_000,
  })

  if (!flow) return null
  const { item, mode } = flow

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={isSubmitting ? undefined : onClose}
      />
      <div className="relative z-50 w-full max-w-sm overflow-hidden rounded-3xl border border-border bg-white p-6 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          aria-label="Cancel"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-50"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-1 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ChefHat className="h-5 w-5" />
          </div>
          <h3 className="text-base font-bold text-foreground">
            {mode === 'required' ? "Who's making this?" : 'Reassign'}
          </h3>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          {item.quantity}x {item.menuItem?.name ?? item.itemName}
        </p>

        <div className="max-h-72 space-y-1 overflow-y-auto">
          {isLoading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Loading…</div>
          ) : !staff || staff.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No kitchen staff found. Add the Kitchen role to a staff member in Settings → Users.
            </div>
          ) : (
            staff.map((person) => (
              <button
                key={person.id}
                type="button"
                disabled={isSubmitting}
                onClick={() => onSelect(person.id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors hover:bg-muted disabled:opacity-50',
                  item.assignedToId === person.id && 'text-primary',
                )}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">
                  {getInitials(person.firstName, person.lastName)}
                </span>
                {person.firstName} {person.lastName}
              </button>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function TicketCard({ order, items, now }: { order: Order; items: OrderItem[]; now: number }) {
  const queryClient = useQueryClient()
  const [assignmentFlow, setAssignmentFlow] = useState<AssignmentFlow | null>(null)

  const updateItemStatus = useMutation({
    mutationFn: ({ itemId, status }: { itemId: string; status: OrderItemStatus }) =>
      ordersApi.updateItemStatus(order.id, itemId, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kitchen-orders'] }),
    onError: () => toast.error('Failed to update item status'),
  })

  const updateItemAssignee = useMutation({
    mutationFn: ({ itemId, assignedToId }: { itemId: string; assignedToId: string }) =>
      ordersApi.updateItemAssignee(order.id, itemId, assignedToId),
    onError: () => toast.error('Failed to assign'),
  })

  // Picking a name either (a) assigns AND advances Pending → On It in one go, when the modal is
  // gating that transition, or (b) just reassigns an already in-progress item — the status is
  // left alone in that case.
  const isAssigning = updateItemAssignee.isPending || updateItemStatus.isPending
  const handleSelectStaff = async (staffId: string) => {
    if (!assignmentFlow) return
    const { item, mode } = assignmentFlow
    try {
      await updateItemAssignee.mutateAsync({ itemId: item.id, assignedToId: staffId })
      if (mode === 'required') {
        await updateItemStatus.mutateAsync({ itemId: item.id, status: 'ON_IT' })
      }
      queryClient.invalidateQueries({ queryKey: ['kitchen-orders'] })
      setAssignmentFlow(null)
    } catch {
      // Errors already toasted by the individual mutations; leave the modal open to retry.
    }
  }

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
                        onClick={() => {
                          // Moving Pending → On It requires picking who's making it first — the
                          // modal itself advances the status once someone's picked.
                          if (s === 'ON_IT' && item.status === 'PENDING') {
                            setAssignmentFlow({ item, mode: 'required' })
                            return
                          }
                          updateItemStatus.mutate({ itemId: item.id, status: s })
                        }}
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
                  {item.assignedTo && (
                    <button
                      type="button"
                      onClick={() => setAssignmentFlow({ item, mode: 'reassign' })}
                      className="mt-3 flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/15"
                    >
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                        {getInitials(item.assignedTo.firstName, item.assignedTo.lastName)}
                      </span>
                      {item.assignedTo.firstName}
                    </button>
                  )}
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

      <AssignStaffModal
        flow={assignmentFlow}
        onClose={() => setAssignmentFlow(null)}
        onSelect={handleSelectStaff}
        isSubmitting={isAssigning}
      />
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

  // "New order" sound — a distinct chime plays whenever an order id shows up on this station's
  // board that wasn't there on the previous poll. Web Audio requires the AudioContext to be
  // created/resumed from a live user gesture (autoplay policy), so nothing can play until the
  // "Enable sound" prompt is tapped — a kitchen tablet often sits untouched since the last reload,
  // so this can't be skipped even if the preference below is "on".
  const muteStorageKey = `pos-ticket-sound-muted-${station}`
  const [muted, setMuted] = useState(() => localStorage.getItem(muteStorageKey) === 'true')
  const [soundEnabled, setSoundEnabled] = useState(false)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const prevOrderIdsRef = useRef<Set<string> | null>(null)

  useEffect(() => {
    const currentIds = new Set(tickets.map((t) => t.order.id))
    const prevIds = prevOrderIdsRef.current
    if (prevIds) {
      const hasNewOrder = [...currentIds].some((id) => !prevIds.has(id))
      if (hasNewOrder && soundEnabled && !muted && audioCtxRef.current) {
        playOrderChime(audioCtxRef.current)
      }
    }
    prevOrderIdsRef.current = currentIds
    // Only the id set matters for the diff — re-running per keystroke-like `now` ticks would
    // pointlessly recompute this every second.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets])

  const enableSound = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = createOrderChimeContext()
    }
    audioCtxRef.current.resume()
    setSoundEnabled(true)
    playOrderChime(audioCtxRef.current) // confirms it's working
  }

  const toggleMuted = () => {
    setMuted((prev) => {
      const next = !prev
      localStorage.setItem(muteStorageKey, String(next))
      return next
    })
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title={title} description={description} />

      {!muted && !soundEnabled && (
        <button
          type="button"
          onClick={enableSound}
          className="mx-4 mt-3 flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 text-left text-sm font-semibold text-primary transition-colors hover:bg-primary/10 sm:mx-6"
        >
          <Bell className="h-4 w-4 shrink-0" />
          Tap to enable a sound for new orders
        </button>
      )}

      <div className="flex items-center justify-end px-4 pt-3 sm:px-6">
        <button
          type="button"
          onClick={toggleMuted}
          title={muted ? 'Unmute new-order sound' : 'Mute new-order sound'}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted"
        >
          {muted ? <BellOff className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
          {muted ? 'Sound off' : 'Sound on'}
        </button>
      </div>

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
