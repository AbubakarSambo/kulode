import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Download, X } from 'lucide-react'
import { Header } from '@/components/layout'
import { Button, Card, CardContent, Badge, Select, Input, Label } from '@/components/ui'
import { Modal } from '@/components/shared/Modal'
import { ordersApi } from '@/api'
import { formatCurrency, cn } from '@/lib/utils'
import type { OrderItemStatus } from '@/types'

const ITEM_STATUS_FLOW: OrderItemStatus[] = ['PENDING', 'PREPARING', 'READY', 'SERVED']

const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'CARD', label: 'Card' },
  { value: 'PAYSTACK', label: 'Paystack (checkout link)' },
  { value: 'OTHER', label: 'Other' },
] as const

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [closeModalOpen, setCloseModalOpen] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<(typeof PAYMENT_METHODS)[number]['value']>('CASH')
  const [customerEmail, setCustomerEmail] = useState('')

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => ordersApi.get(id!),
    enabled: !!id,
    refetchInterval: 10_000,
  })

  const updateItemStatus = useMutation({
    mutationFn: ({ itemId, status }: { itemId: string; status: OrderItemStatus }) =>
      ordersApi.updateItemStatus(id!, itemId, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['order', id] }),
    onError: () => toast.error('Failed to update item status'),
  })

  const cancelOrder = useMutation({
    mutationFn: () => ordersApi.cancel(id!),
    onSuccess: () => {
      toast.success('Order cancelled')
      navigate('/pos/tables')
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(message || 'Failed to cancel order')
    },
  })

  const closeOrder = useMutation({
    mutationFn: async () => {
      if (paymentMethod === 'PAYSTACK') {
        return ordersApi.paystackCheckout(id!, { paymentMethod, customerEmail })
      }
      return ordersApi.close(id!, { paymentMethod })
    },
    onSuccess: (result) => {
      if ('paymentUrl' in result) {
        window.open(result.paymentUrl, '_blank')
        toast.success('Checkout link opened — order closes once payment confirms')
        setCloseModalOpen(false)
        return
      }
      toast.success('Order closed')
      setCloseModalOpen(false)
      queryClient.invalidateQueries({ queryKey: ['order', id] })
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(message || 'Failed to close order')
    },
  })

  const downloadReceipt = async () => {
    if (!id) return
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
        </div>

        <div className="space-y-3">
          {order.items.map((item) => (
            <Card key={item.id} className="p-4">
              <CardContent className="p-0">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-foreground">
                      {item.quantity}x {item.menuItem.name}
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
                        {s}
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
            <Button variant="outline" className="flex-1" onClick={() => cancelOrder.mutate()} isLoading={cancelOrder.isPending}>
              <X className="mr-1.5 h-4 w-4" /> Cancel Order
            </Button>
            <Button className="flex-1" onClick={() => setCloseModalOpen(true)}>
              Close & Pay
            </Button>
          </div>
        )}
      </div>

      <Modal isOpen={closeModalOpen} onClose={() => setCloseModalOpen(false)} title="Close Order">
        <div className="space-y-4">
          <div>
            <Label>Payment Method</Label>
            <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </Select>
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
          <div className="rounded-xl bg-muted p-4 text-center">
            <div className="text-sm text-muted-foreground">Amount Due</div>
            <div className="text-2xl font-bold text-foreground">{formatCurrency(order.total)}</div>
          </div>
          <Button
            className="w-full"
            isLoading={closeOrder.isPending}
            disabled={paymentMethod === 'PAYSTACK' && !customerEmail}
            onClick={() => closeOrder.mutate()}
          >
            {paymentMethod === 'PAYSTACK' ? 'Generate Checkout Link' : 'Confirm Payment & Close'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
