import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CreditCard } from 'lucide-react'
import { Header } from '@/components/layout'
import { Button, Input, Card, CardContent, Badge, EmptyState } from '@/components/ui'
import { paymentsApi } from '@/api'
import { formatCurrency, formatDateTime, formatPaymentMethod } from '@/lib/utils'

// POS (order-linked) payments only — invoice payments live at /payments. Kept as a separate page
// rather than merged into that one since the two are rendered very differently (order/table info
// here vs invoice/client there) and mixing them produced dead invoice links for order-linked rows.
export function PosPaymentsPage() {
  const [page, setPage] = useState(1)
  const [paymentMethod, setPaymentMethod] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const limit = 50

  const { data, isLoading } = useQuery({
    queryKey: ['pos-payments', { page, paymentMethod, startDate, endDate }],
    queryFn: () =>
      paymentsApi.listPos({
        page,
        limit,
        paymentMethod: paymentMethod || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      }),
  })

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title="POS Payments" description="Payments recorded against orders — cash, card, Paystack, Moniepoint, wallet" icon={CreditCard} badgeText={data?.meta.total} />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap gap-3">
          <Input
            placeholder="Filter by method (e.g. CASH, MONIEPOINT_POS)"
            value={paymentMethod}
            onChange={(e) => {
              setPaymentMethod(e.target.value)
              setPage(1)
            }}
            className="max-w-xs"
          />
          <Input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value)
              setPage(1)
            }}
            className="max-w-[160px]"
          />
          <Input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value)
              setPage(1)
            }}
            className="max-w-[160px]"
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : !data || data.data.length === 0 ? (
          <EmptyState icon={CreditCard} title="No POS payments yet" description="Payments taken against orders will show up here" />
        ) : (
          <>
            {/* Desktop table */}
            <Card className="hidden overflow-hidden md:block">
              <CardContent className="p-0">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3">Order</th>
                      <th className="px-4 py-3">Method</th>
                      <th className="px-4 py-3">Reference</th>
                      <th className="px-4 py-3">Recorded By</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.data.map((payment) => (
                      <tr key={payment.id} className="hover:bg-muted/40">
                        <td className="px-4 py-3 text-sm">
                          {payment.order ? (
                            <Link to={`/pos/orders/${payment.order.id}`} className="font-medium text-primary hover:underline">
                              {payment.order.table?.name ?? payment.order.source}
                              {payment.order.customer && <span className="text-muted-foreground"> · {payment.order.customer.name}</span>}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-foreground">{formatPaymentMethod(payment.paymentMethod)}</span>
                            {payment.isAutoRecorded && (
                              <Badge variant="default" className="text-[10px]">
                                auto
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {payment.moniepointReference ?? payment.reference ?? '—'}
                          {payment.notes && <div className="mt-0.5 text-[11px] text-muted-foreground/80">{payment.notes}</div>}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {payment.recordedBy ? `${payment.recordedBy.firstName} ${payment.recordedBy.lastName}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{formatDateTime(payment.paymentDate)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-foreground">{formatCurrency(payment.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* Mobile cards */}
            <div className="flex flex-col gap-3 md:hidden">
              {data.data.map((payment) => (
                <Card key={payment.id} className="p-4">
                  <CardContent className="p-0">
                    <div className="flex items-start justify-between">
                      <div>
                        {payment.order ? (
                          <Link to={`/pos/orders/${payment.order.id}`} className="font-semibold text-primary hover:underline">
                            {payment.order.table?.name ?? payment.order.source}
                          </Link>
                        ) : (
                          <span className="font-semibold text-foreground">—</span>
                        )}
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          {formatPaymentMethod(payment.paymentMethod)}
                          {payment.isAutoRecorded && (
                            <Badge variant="default" className="text-[10px]">
                              auto
                            </Badge>
                          )}
                        </div>
                      </div>
                      <span className="font-semibold text-foreground">{formatCurrency(payment.amount)}</span>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">{formatDateTime(payment.paymentDate)}</div>
                    {(payment.moniepointReference || payment.reference) && (
                      <div className="mt-1 text-xs text-muted-foreground">{payment.moniepointReference ?? payment.reference}</div>
                    )}
                  </CardContent>
                </Card>
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
                <Button variant="outline" size="sm" disabled={page === data.meta.totalPages} onClick={() => setPage(page + 1)}>
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
