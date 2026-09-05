import { Fragment, useEffect, useRef, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Receipt, ChevronRight, ArrowUpRight, Search } from 'lucide-react'
import { ReceiptTextIcon } from '@hugeicons/core-free-icons'
import { Header } from '@/components/layout'
import { Select, Input, Card, CardContent, Badge, EmptyState, Button } from '@/components/ui'
import { ordersApi, tablesApi } from '@/api'
import { formatCurrency, formatDateTime, formatPaymentMethod, cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth'
import type { OrderStatus } from '@/types'

function statusBadgeVariant(status: OrderStatus) {
  return status === 'CLOSED_PAID' ? 'success' : status === 'CANCELLED' ? 'destructive' : 'default'
}

// Attributed to the assigned waiter when there is one, else whoever created the order (e.g. a
// cashier ringing up a walk-in with no waiter) — matches the same fallback used for "Top Staff" on
// the POS dashboard, so a table's staff column always shows someone rather than a blank "—".
function staffName(order: { waiter?: { firstName: string; lastName: string }; createdBy?: { firstName: string; lastName: string } }) {
  const person = order.waiter ?? order.createdBy
  return person ? `${person.firstName} ${person.lastName}` : '—'
}

// Shared inline detail panel — lazily fetches the full order (items/payments) only once its row
// is expanded, so browsing the list stays on the lightweight `listSummary` shape.
function OrderDetailPanel({ orderId }: { orderId: string }) {
  const { data: order, isLoading } = useQuery({
    queryKey: ['orders', orderId],
    queryFn: () => ordersApi.get(orderId),
  })

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        Loading order details…
      </div>
    )
  }
  if (!order) {
    return <p className="py-2 text-sm text-muted-foreground">Couldn't load this order.</p>
  }

  return (
    <div className="space-y-3 py-1">
      <div className="space-y-1.5">
        {order.items.map((item) => (
          <div key={item.id} className="flex items-start justify-between gap-3 text-sm">
            <span className="text-foreground">
              {item.quantity}× {item.itemName}
              {item.notes && <span className="text-xs text-muted-foreground"> · {item.notes}</span>}
            </span>
            <span className="shrink-0 font-medium text-foreground">{formatCurrency(item.amount)}</span>
          </div>
        ))}
      </div>

      {order.payments.length > 0 && (
        <div className="space-y-1 border-t border-border pt-2">
          {order.payments.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {formatPaymentMethod(p.paymentMethod)} · {formatDateTime(p.paymentDate)}
              </span>
              <span>{formatCurrency(p.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {order.notes && <p className="text-xs italic text-muted-foreground">Note: {order.notes}</p>}

      <div className="flex items-center justify-between border-t border-border pt-2">
        <span className="text-sm font-semibold text-foreground">Total: {formatCurrency(order.total)}</span>
        <Link
          to={`/pos/orders/${order.id}`}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Open full order <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  )
}

const STATUS_OPTIONS: { value: OrderStatus | ''; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_KITCHEN', label: 'In Kitchen' },
  { value: 'READY', label: 'Ready' },
  { value: 'CLOSED_PAID', label: 'Closed / Paid' },
  { value: 'CLOSED_UNPAID', label: 'Closed / Unpaid' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

export function OrdersListPage() {
  const [searchParams] = useSearchParams()
  const customerId = searchParams.get('customerId') || undefined
  const waiterId = searchParams.get('waiterId') || undefined

  // Defaults to Open on the plain orders list — the common case is checking what's currently
  // active. A customer/waiter history view (arrived via query param) defaults to All Statuses
  // instead, since that's meant to show their full order history, not just what's running now.
  const [status, setStatus] = useState<OrderStatus | ''>(customerId || waiterId ? '' : 'OPEN')
  const [tableId, setTableId] = useState('')
  const [page, setPage] = useState(1)
  const limit = 100

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(handler)
  }, [search])
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch])

  // Which rows are expanded inline (accordion) — multiple can be open at once so comparing a
  // couple of orders side by side doesn't mean re-expanding one after closing the other.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const currentUser = useAuthStore((s) => s.user)
  const isCashier = !!currentUser?.roles.includes('CASHIER')

  const { data: tables } = useQuery({ queryKey: ['restaurant-tables'], queryFn: () => tablesApi.list() })

  // Cashier notification queue — polls the awaiting-payment count independent of whatever
  // filter is currently selected, and toasts when a new order shows up in it.
  const { data: awaitingPayment } = useQuery({
    queryKey: ['orders-summary', 'awaiting-payment-count'],
    // Only `meta.total` is ever read below — the full order graph would be fetched and
    // discarded every 15s otherwise.
    queryFn: () => ordersApi.listSummary({ status: 'CLOSED_UNPAID', page: 1, limit: 1 }),
    enabled: isCashier,
    refetchInterval: isCashier ? 15_000 : undefined,
  })
  const prevAwaitingCountRef = useRef<number | null>(null)
  useEffect(() => {
    if (!isCashier || !awaitingPayment) return
    const count = awaitingPayment.meta.total
    if (prevAwaitingCountRef.current !== null && count > prevAwaitingCountRef.current) {
      toast.success('An order is ready for payment')
    }
    prevAwaitingCountRef.current = count
  }, [awaitingPayment, isCashier])

  const { data, isLoading } = useQuery({
    queryKey: ['orders-summary', { status, tableId, customerId, waiterId, page, search: debouncedSearch }],
    // Table only renders table/customer name, status, total, createdAt — none of the
    // items/menuItem/payments graph `list` would otherwise fetch for every row.
    queryFn: () =>
      ordersApi.listSummary({
        status: status || undefined,
        tableId: tableId || undefined,
        customerId,
        waiterId,
        search: debouncedSearch || undefined,
        page,
        limit,
      }),
  })

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title="Orders" description="Browse past and current orders" icon={Receipt} badgeText={data?.meta.total} />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="relative mb-4 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search order #, customer, or waiter..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          {isCashier && !!awaitingPayment?.meta.total && (
            <Button
              size="sm"
              variant={status === 'CLOSED_UNPAID' ? 'default' : 'outline'}
              onClick={() => {
                setStatus('CLOSED_UNPAID')
                setPage(1)
              }}
            >
              Awaiting Payment ({awaitingPayment.meta.total})
            </Button>
          )}
          <Select
            className="w-auto"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as OrderStatus | '')
              setPage(1)
            }}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>

          <Select
            className="w-auto"
            value={tableId}
            onChange={(e) => {
              setTableId(e.target.value)
              setPage(1)
            }}
          >
            <option value="">All Tables</option>
            {tables?.map((table) => (
              <option key={table.id} value={table.id}>
                {table.name}
              </option>
            ))}
          </Select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : !data || data.data.length === 0 ? (
          <EmptyState icon={ReceiptTextIcon} title="No orders found" description="Try adjusting your filters" />
        ) : (
          <>
            <Card className="hidden overflow-hidden md:block">
              <CardContent className="p-0">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3">Order</th>
                      <th className="px-4 py-3">Table / Source</th>
                      <th className="px-4 py-3">Customer</th>
                      <th className="px-4 py-3">Staff</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.data.map((order) => {
                      const isExpanded = expandedIds.has(order.id)
                      return (
                        <Fragment key={order.id}>
                          <tr
                            onClick={() => toggleExpanded(order.id)}
                            className="cursor-pointer hover:bg-muted/40"
                          >
                            <td className="px-4 py-3 font-semibold text-foreground">
                              <div className="flex items-center gap-1.5">
                                <ChevronRight
                                  className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', isExpanded && 'rotate-90')}
                                />
                                #{order.id.slice(0, 8).toUpperCase()}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">
                              {order.table?.name ?? order.source.replace('_', ' ')}
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">
                              {order.customer?.name ?? '—'}
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">
                              {staffName(order)}
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant={statusBadgeVariant(order.status)}>{order.status.replace('_', ' ')}</Badge>
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-foreground">
                              {formatCurrency(order.total)}
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">{formatDateTime(order.createdAt)}</td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-muted/20">
                              <td colSpan={7} className="px-4 pb-3 pl-10 pr-4">
                                <OrderDetailPanel orderId={order.id} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <div className="flex flex-col gap-3 md:hidden">
              {data.data.map((order) => {
                const isExpanded = expandedIds.has(order.id)
                return (
                  <Card key={order.id} className="p-4" onClick={() => toggleExpanded(order.id)}>
                    <CardContent className="p-0">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 font-semibold text-foreground">
                          <ChevronRight
                            className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', isExpanded && 'rotate-90')}
                          />
                          #{order.id.slice(0, 8).toUpperCase()}
                        </span>
                        <Badge variant={statusBadgeVariant(order.status)}>{order.status.replace('_', ' ')}</Badge>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {order.table?.name ?? order.source.replace('_', ' ')}
                          {order.customer ? ` · ${order.customer.name}` : ''}
                          {` · ${staffName(order)}`}
                        </span>
                        <span className="font-semibold text-foreground">{formatCurrency(order.total)}</span>
                      </div>
                      {isExpanded && (
                        <div className="mt-3 border-t border-border pt-3">
                          <OrderDetailPanel orderId={order.id} />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            {data.meta.totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground">
                  Page {page} of {data.meta.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === data.meta.totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
