import { useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { ArrowLeft, Pencil, Trash2, Wallet, PlusCircle, Settings2, ShieldCheck } from 'lucide-react'
import { Header } from '@/components/layout'
import { Button, Input, Label, Select, Card, CardContent, Badge, ConfirmDialog } from '@/components/ui'
import { Modal } from '@/components/shared/Modal'
import { customersApi, walletApi } from '@/api'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth'
import type { Customer, OrderStatus, OrderSource, WalletTransactionType } from '@/types'

interface CustomerOrderSummary {
  id: string
  status: OrderStatus
  total: number
  source: OrderSource
  createdAt: string
  closedAt?: string
}

type CustomerWithOrders = Customer & { orders: CustomerOrderSummary[] }

const customerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  notes: z.string().optional(),
})
type CustomerFormData = z.infer<typeof customerSchema>

const TOPUP_PAYMENT_METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'CARD', label: 'Card' },
  { value: 'OTHER', label: 'Other' },
] as const

const WALLET_TRANSACTION_LABELS: Record<WalletTransactionType, string> = {
  TOPUP: 'Top Up',
  ORDER_DEBIT: 'Order Payment',
  REFUND: 'Refund',
  ADJUSTMENT: 'Adjustment',
}

function errorMessage(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback
}

function WalletSection({ customerId, balance, creditLimit }: { customerId: string; balance: number; creditLimit: number }) {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const canTopUp = !!user?.roles.some((r) => r === 'SUPER_ADMIN' || r === 'ADMIN' || r === 'ACCOUNTANT' || r === 'CASHIER')
  const canAdjust = !!user?.roles.some((r) => r === 'SUPER_ADMIN' || r === 'ADMIN' || r === 'CASHIER')
  const canGrantCredit = !!user?.roles.some((r) => r === 'SUPER_ADMIN' || r === 'ADMIN' || r === 'CASHIER')

  const [topUpOpen, setTopUpOpen] = useState(false)
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [creditOpen, setCreditOpen] = useState(false)
  const [page, setPage] = useState(1)

  const [topUpAmount, setTopUpAmount] = useState('')
  const [topUpMethod, setTopUpMethod] = useState<(typeof TOPUP_PAYMENT_METHODS)[number]['value']>('CASH')
  const [topUpNotes, setTopUpNotes] = useState('')

  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjustReason, setAdjustReason] = useState('')

  const [creditLimitInput, setCreditLimitInput] = useState(creditLimit > 0 ? String(creditLimit) : '')

  const { data: transactions, isLoading } = useQuery({
    queryKey: ['wallet-transactions', customerId, page],
    queryFn: () => walletApi.listTransactions(customerId, { page, limit: 100 }),
  })

  const invalidateWallet = () => {
    queryClient.invalidateQueries({ queryKey: ['customers', customerId] })
    queryClient.invalidateQueries({ queryKey: ['customers'] })
    queryClient.invalidateQueries({ queryKey: ['wallet-transactions', customerId] })
    queryClient.invalidateQueries({ queryKey: ['wallet-balance', customerId] })
  }

  const topUp = useMutation({
    mutationFn: () =>
      walletApi.topUp(customerId, {
        amount: Number(topUpAmount),
        paymentMethod: topUpMethod,
        notes: topUpNotes || undefined,
        clientRequestId: crypto.randomUUID(),
      }),
    onSuccess: () => {
      toast.success('Wallet topped up')
      invalidateWallet()
      setTopUpOpen(false)
      setTopUpAmount('')
      setTopUpNotes('')
    },
    onError: (err: unknown) => toast.error(errorMessage(err, 'Failed to top up wallet')),
  })

  const adjust = useMutation({
    mutationFn: () =>
      walletApi.adjust(customerId, {
        amount: Number(adjustAmount),
        reason: adjustReason,
        clientRequestId: crypto.randomUUID(),
      }),
    onSuccess: () => {
      toast.success('Wallet balance adjusted')
      invalidateWallet()
      setAdjustOpen(false)
      setAdjustAmount('')
      setAdjustReason('')
    },
    onError: (err: unknown) => toast.error(errorMessage(err, 'Failed to adjust wallet')),
  })

  const setCredit = useMutation({
    mutationFn: () => customersApi.updateCredit(customerId, Number(creditLimitInput)),
    onSuccess: () => {
      toast.success('Credit limit updated')
      invalidateWallet()
      setCreditOpen(false)
    },
    onError: (err: unknown) => toast.error(errorMessage(err, 'Failed to update credit limit')),
  })

  return (
    <Card className="mt-4 p-4">
      <CardContent className="p-0">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold text-foreground">Wallet</h3>
          </div>
          <div className="flex gap-2">
            {canGrantCredit && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCreditLimitInput(creditLimit > 0 ? String(creditLimit) : '')
                  setCreditOpen(true)
                }}
              >
                <ShieldCheck className="mr-1.5 h-4 w-4" /> Credit
              </Button>
            )}
            {canAdjust && (
              <Button variant="outline" size="sm" onClick={() => setAdjustOpen(true)}>
                <Settings2 className="mr-1.5 h-4 w-4" /> Adjust
              </Button>
            )}
            {canTopUp && (
              <Button size="sm" onClick={() => setTopUpOpen(true)}>
                <PlusCircle className="mr-1.5 h-4 w-4" /> Top Up
              </Button>
            )}
          </div>
        </div>

        <div className="mb-4 rounded-xl border border-border p-3">
          <div className="text-xs text-muted-foreground">Current Balance</div>
          <div className={cn('text-2xl font-bold', balance < 0 ? 'text-destructive' : 'text-foreground')}>
            {formatCurrency(balance)}
          </div>
          {balance < 0 && (
            <p className="mt-1 text-xs text-destructive">Customer is on account (owes this amount)</p>
          )}
          <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            {creditLimit > 0
              ? `Approved for up to ${formatCurrency(creditLimit)} in credit purchases`
              : 'Not approved for credit purchases'}
          </div>
        </div>

        {isLoading ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Loading transactions…</p>
        ) : !transactions || transactions.data.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No wallet activity yet</p>
        ) : (
          <div className="space-y-2">
            {transactions.data.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between rounded-xl border border-border p-3"
              >
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    {WALLET_TRANSACTION_LABELS[tx.type]}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(tx.createdAt)}
                    {tx.createdBy && ` · ${tx.createdBy.firstName} ${tx.createdBy.lastName}`}
                    {tx.notes && ` · ${tx.notes}`}
                  </div>
                </div>
                <div className="text-right">
                  <div className={cn('text-sm font-semibold', tx.amount < 0 ? 'text-destructive' : 'text-emerald-600')}>
                    {tx.amount > 0 ? '+' : ''}
                    {formatCurrency(tx.amount)}
                  </div>
                  <div className="text-xs text-muted-foreground">Bal: {formatCurrency(tx.balanceAfter)}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {transactions && transactions.meta.totalPages > 1 && (
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="font-medium text-primary disabled:text-muted-foreground disabled:opacity-50"
            >
              Previous
            </button>
            <span>
              Page {transactions.meta.page} of {transactions.meta.totalPages}
            </span>
            <button
              disabled={page >= transactions.meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="font-medium text-primary disabled:text-muted-foreground disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </CardContent>

      <Modal isOpen={topUpOpen} onClose={() => setTopUpOpen(false)} title="Top Up Wallet">
        <div className="space-y-4">
          <div>
            <Label>Amount</Label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={topUpAmount}
              onChange={(e) => setTopUpAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div>
            <Label>Payment Method</Label>
            <Select value={topUpMethod} onChange={(e) => setTopUpMethod(e.target.value as typeof topUpMethod)}>
              {TOPUP_PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Input value={topUpNotes} onChange={(e) => setTopUpNotes(e.target.value)} />
          </div>
          <Button
            className="w-full"
            isLoading={topUp.isPending}
            disabled={!topUpAmount || Number(topUpAmount) <= 0}
            onClick={() => topUp.mutate()}
          >
            Confirm Top Up
          </Button>
        </div>
      </Modal>

      <Modal isOpen={adjustOpen} onClose={() => setAdjustOpen(false)} title="Adjust Wallet Balance">
        <div className="space-y-4">
          <div>
            <Label>Signed Amount</Label>
            <Input
              type="number"
              step="0.01"
              value={adjustAmount}
              onChange={(e) => setAdjustAmount(e.target.value)}
              placeholder="e.g. -30 to debit, 30 to credit"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Positive credits the wallet, negative debits it (can take the balance negative).
            </p>
          </div>
          <div>
            <Label>Reason</Label>
            <Input
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
              placeholder="Why is this manual override needed?"
            />
          </div>
          <Button
            className="w-full"
            isLoading={adjust.isPending}
            disabled={!adjustAmount || Number(adjustAmount) === 0 || !adjustReason}
            onClick={() => adjust.mutate()}
          >
            Confirm Adjustment
          </Button>
        </div>
      </Modal>

      <Modal isOpen={creditOpen} onClose={() => setCreditOpen(false)} title="Credit Approval">
        <div className="space-y-4">
          <div>
            <Label>Credit Limit</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={creditLimitInput}
              onChange={(e) => setCreditLimitInput(e.target.value)}
              placeholder="0.00"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              How far this customer's wallet may go negative on a purchase. Set to 0 to revoke credit.
            </p>
          </div>
          <Button
            className="w-full"
            isLoading={setCredit.isPending}
            disabled={creditLimitInput === '' || Number(creditLimitInput) < 0}
            onClick={() => setCredit.mutate()}
          >
            Save Credit Limit
          </Button>
        </div>
      </Modal>
    </Card>
  )
}

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const { data: customer, isLoading } = useQuery({
    queryKey: ['customers', id],
    queryFn: () => customersApi.get(id!) as Promise<CustomerWithOrders>,
    enabled: !!id,
  })

  const form = useForm<CustomerFormData>({ resolver: zodResolver(customerSchema) })

  const updateCustomer = useMutation({
    mutationFn: (data: CustomerFormData) =>
      customersApi.update(id!, { ...data, email: data.email || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers', id] })
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      toast.success('Customer updated')
      setEditOpen(false)
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(message || 'Failed to update customer')
    },
  })

  const deleteCustomer = useMutation({
    mutationFn: () => customersApi.delete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      toast.success('Customer deactivated')
      navigate('/pos/customers')
    },
  })

  if (isLoading || !customer) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header
        title={customer.name}
        description={customer.phone}
        action={
          <Button variant="ghost" size="sm" onClick={() => navigate('/pos/customers')}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-4 md:col-span-1">
            <CardContent className="space-y-3 p-0">
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-foreground">{customer.name}</span>
                {!customer.isActive && <Badge variant="default">Inactive</Badge>}
              </div>
              <div className="space-y-1 text-sm">
                <div className="text-muted-foreground">Phone</div>
                <div className="font-medium text-foreground">{customer.phone || '—'}</div>
              </div>
              {customer.email && (
                <div className="space-y-1 text-sm">
                  <div className="text-muted-foreground">Email</div>
                  <div className="font-medium text-foreground">{customer.email}</div>
                </div>
              )}
              {customer.notes && (
                <div className="space-y-1 text-sm">
                  <div className="text-muted-foreground">Notes</div>
                  <div className="font-medium text-foreground">{customer.notes}</div>
                </div>
              )}
              <div className="space-y-1 text-sm">
                <div className="text-muted-foreground">Customer since</div>
                <div className="font-medium text-foreground">{formatDate(customer.createdAt)}</div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    form.reset({
                      name: customer.name,
                      phone: customer.phone,
                      email: customer.email ?? '',
                      notes: customer.notes ?? '',
                    })
                    setEditOpen(true)
                  }}
                >
                  <Pencil className="mr-1.5 h-4 w-4" /> Edit
                </Button>
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="mr-1.5 h-4 w-4" /> Delete
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="p-4 md:col-span-2">
            <CardContent className="p-0">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold text-foreground">Order History</h3>
                <Link
                  to={`/pos/orders?customerId=${customer.id}`}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  View all orders
                </Link>
              </div>
              {customer.orders.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No orders yet</p>
              ) : (
                <div className="space-y-2">
                  {customer.orders.map((order) => (
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

        <WalletSection customerId={customer.id} balance={customer.walletBalance} creditLimit={customer.creditLimit} />
      </div>

      <Modal isOpen={editOpen} onClose={() => setEditOpen(false)} title="Edit Customer">
        <form onSubmit={form.handleSubmit((data) => updateCustomer.mutate(data))} className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input {...form.register('name')} />
          </div>
          <div>
            <Label>Phone (optional)</Label>
            <Input {...form.register('phone')} />
          </div>
          <div>
            <Label>Email (optional)</Label>
            <Input type="email" {...form.register('email')} />
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Input {...form.register('notes')} />
          </div>
          <Button type="submit" className="w-full" isLoading={updateCustomer.isPending}>
            Save Changes
          </Button>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => deleteCustomer.mutate()}
        title="Delete Customer"
        description={`Are you sure you want to delete ${customer.name}? Their past orders will be kept but no longer editable to this profile.`}
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous
        isLoading={deleteCustomer.isPending}
      />
    </div>
  )
}
