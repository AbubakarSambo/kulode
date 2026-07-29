import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Receipt } from 'lucide-react'
import { Header } from '@/components/layout'
import { Select, Card, CardContent, Badge, EmptyState, Button } from '@/components/ui'
import { ordersApi, tablesApi } from '@/api'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { OrderStatus } from '@/types'

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
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const customerId = searchParams.get('customerId') || undefined

  const [status, setStatus] = useState<OrderStatus | ''>('')
  const [tableId, setTableId] = useState('')
  const [page, setPage] = useState(1)
  const limit = 20

  const { data: tables } = useQuery({ queryKey: ['restaurant-tables'], queryFn: () => tablesApi.list() })

  const { data, isLoading } = useQuery({
    queryKey: ['orders', { status, tableId, customerId, page }],
    queryFn: () =>
      ordersApi.list({
        status: status || undefined,
        tableId: tableId || undefined,
        customerId,
        page,
        limit,
      }),
  })

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title="Orders" description="Browse past and current orders" icon={Receipt} badgeText={data?.meta.total} />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
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
          <EmptyState icon={Receipt} title="No orders found" description="Try adjusting your filters" />
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
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.data.map((order) => (
                      <tr
                        key={order.id}
                        onClick={() => navigate(`/pos/orders/${order.id}`)}
                        className="cursor-pointer hover:bg-muted/40"
                      >
                        <td className="px-4 py-3 font-semibold text-foreground">
                          #{order.id.slice(0, 8).toUpperCase()}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {order.table?.name ?? order.source.replace('_', ' ')}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {order.customer?.name ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={
                              order.status === 'CLOSED_PAID'
                                ? 'success'
                                : order.status === 'CANCELLED'
                                  ? 'destructive'
                                  : 'default'
                            }
                          >
                            {order.status.replace('_', ' ')}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-foreground">
                          {formatCurrency(order.total)}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(order.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <div className="flex flex-col gap-3 md:hidden">
              {data.data.map((order) => (
                <Link key={order.id} to={`/pos/orders/${order.id}`}>
                  <Card className="p-4">
                    <CardContent className="p-0">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground">#{order.id.slice(0, 8).toUpperCase()}</span>
                        <Badge
                          variant={
                            order.status === 'CLOSED_PAID'
                              ? 'success'
                              : order.status === 'CANCELLED'
                                ? 'destructive'
                                : 'default'
                          }
                        >
                          {order.status.replace('_', ' ')}
                        </Badge>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {order.table?.name ?? order.source.replace('_', ' ')}
                          {order.customer ? ` · ${order.customer.name}` : ''}
                        </span>
                        <span className="font-semibold text-foreground">{formatCurrency(order.total)}</span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
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
