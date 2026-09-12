import { useNavigate, useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { Header } from '@/components/layout'
import { Button, Card, CardContent, Badge } from '@/components/ui'
import { usersApi } from '@/api'
import { formatCurrency, formatDate } from '@/lib/utils'

// Read-only — editing a staff member's name/phone/notes/roles now happens on the Users page.
// This page survives purely for the order-history/performance drill-down (reached from the
// Dashboard's "Top Staff" list), which Users has no equivalent of.
export function WaiterDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: waiter, isLoading } = useQuery({
    queryKey: ['waiter-history', id],
    queryFn: () => usersApi.getOrderHistory(id!),
    enabled: !!id,
  })

  if (isLoading || !waiter) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  const fullName = `${waiter.firstName} ${waiter.lastName}`.trim()

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header
        title={fullName}
        description={waiter.phone ?? undefined}
        action={
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-4 md:col-span-1">
            <CardContent className="space-y-3 p-0">
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-foreground">{fullName}</span>
                <Badge variant={waiter.isActive ? 'success' : 'secondary'}>
                  {waiter.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              {waiter.phone && (
                <div className="space-y-1 text-sm">
                  <div className="text-muted-foreground">Phone</div>
                  <div className="font-medium text-foreground">{waiter.phone}</div>
                </div>
              )}
              {waiter.notes && (
                <div className="space-y-1 text-sm">
                  <div className="text-muted-foreground">Notes</div>
                  <div className="font-medium text-foreground">{waiter.notes}</div>
                </div>
              )}
              <Link to="/settings/users" className="block pt-2 text-xs font-medium text-primary hover:underline">
                Manage roles &amp; details in Users →
              </Link>
            </CardContent>
          </Card>

          <div className="space-y-4 md:col-span-2">
            <div className="grid grid-cols-2 gap-4">
              <Card className="p-4">
                <CardContent className="p-0">
                  <div className="text-xs text-muted-foreground">Orders Served</div>
                  <div className="text-2xl font-bold text-foreground">{waiter.stats.totalOrders}</div>
                </CardContent>
              </Card>
              <Card className="p-4">
                <CardContent className="p-0">
                  <div className="text-xs text-muted-foreground">Total Revenue</div>
                  <div className="text-2xl font-bold text-foreground">{formatCurrency(waiter.stats.totalRevenue)}</div>
                </CardContent>
              </Card>
            </div>

            <Card className="p-4">
              <CardContent className="p-0">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-semibold text-foreground">Recent Orders</h3>
                  <Link
                    to={`/pos/orders?waiterId=${waiter.id}`}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    View all orders
                  </Link>
                </div>
                {waiter.orders.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No orders yet</p>
                ) : (
                  <div className="space-y-2">
                    {waiter.orders.map((order) => (
                      <Link
                        key={order.id}
                        to={`/pos/orders/${order.id}`}
                        className="flex items-center justify-between rounded-xl border border-border p-3 hover:bg-muted/40"
                      >
                        <div>
                          <div className="text-sm font-semibold text-foreground">
                            Order #{order.id.slice(0, 8).toUpperCase()}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {order.source.replace('_', ' ')} · {formatDate(order.createdAt)}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
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
                          <span className="text-sm font-semibold text-foreground">{formatCurrency(order.total)}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
