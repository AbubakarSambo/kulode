import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Landmark } from 'lucide-react'
import { BankIcon } from '@hugeicons/core-free-icons'
import { Header } from '@/components/layout'
import { Button, Card, CardContent, EmptyState, SearchableSelect, Select, Textarea } from '@/components/ui'
import { Modal } from '@/components/shared/Modal'
import { ordersApi, customersApi } from '@/api'
import { moniepointApi } from '@/api/moniepoint'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import type { MoniepointUnreconciledTransfer } from '@/api/moniepoint'

// Bank transfers straight into the merchant's Moniepoint account that attemptTransferReconciliation
// couldn't confidently auto-match to exactly one open order (see moniepoint.service.ts). Previously
// these were only ever visible in server logs — this is the first place a human can act on one.
export function UnreconciledTransfersPage() {
  const queryClient = useQueryClient()
  const [assignTarget, setAssignTarget] = useState<MoniepointUnreconciledTransfer | null>(null)
  const [walletTarget, setWalletTarget] = useState<MoniepointUnreconciledTransfer | null>(null)
  const [ignoreTarget, setIgnoreTarget] = useState<MoniepointUnreconciledTransfer | null>(null)
  const [selectedOrderId, setSelectedOrderId] = useState('')
  const [orderSearch, setOrderSearch] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [walletNotes, setWalletNotes] = useState('')
  const [ignoreNotes, setIgnoreNotes] = useState('')

  const { data: transfers, isLoading } = useQuery({
    queryKey: ['moniepoint-unreconciled-transfers'],
    queryFn: () => moniepointApi.listUnreconciledTransfers('PENDING_REVIEW'),
  })

  const { data: ordersPage } = useQuery({
    queryKey: ['orders', { statuses: ['OPEN', 'IN_KITCHEN', 'READY', 'CLOSED_UNPAID'], search: orderSearch }],
    queryFn: () =>
      ordersApi.list({
        statuses: ['OPEN', 'IN_KITCHEN', 'READY', 'CLOSED_UNPAID'],
        search: orderSearch || undefined,
        limit: 50,
      }),
    enabled: !!assignTarget,
  })
  const orderOptions = (ordersPage?.data ?? []).map((o) => ({
    id: o.id,
    label: `${o.table?.name ?? o.source} — ${formatCurrency(Number(o.total) - Number(o.amountPaid))} due`,
  }))

  const { data: customersPage } = useQuery({
    queryKey: ['customers', { search: customerSearch }],
    queryFn: () => customersApi.list({ search: customerSearch || undefined, limit: 50 }),
    enabled: !!walletTarget,
  })
  const customerOptions = (customersPage?.data ?? []).map((c) => ({
    id: c.id,
    label: c.phone ? `${c.name} — ${c.phone}` : c.name,
  }))

  const assignMutation = useMutation({
    mutationFn: ({ id, orderId }: { id: string; orderId: string }) => moniepointApi.assignUnreconciledTransfer(id, orderId),
    onSuccess: () => {
      toast.success('Transfer applied to order')
      queryClient.invalidateQueries({ queryKey: ['moniepoint-unreconciled-transfers'] })
      setAssignTarget(null)
      setSelectedOrderId('')
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(message || 'Failed to apply transfer')
    },
  })

  const walletMutation = useMutation({
    mutationFn: ({ id, customerId, notes }: { id: string; customerId: string; notes?: string }) =>
      moniepointApi.resolveUnreconciledTransferToWallet(id, customerId, notes),
    onSuccess: () => {
      toast.success('Transfer credited to customer wallet')
      queryClient.invalidateQueries({ queryKey: ['moniepoint-unreconciled-transfers'] })
      setWalletTarget(null)
      setSelectedCustomerId('')
      setWalletNotes('')
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(message || 'Failed to credit wallet')
    },
  })

  const ignoreMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) => moniepointApi.ignoreUnreconciledTransfer(id, notes),
    onSuccess: () => {
      toast.success('Transfer marked as ignored')
      queryClient.invalidateQueries({ queryKey: ['moniepoint-unreconciled-transfers'] })
      setIgnoreTarget(null)
      setIgnoreNotes('')
    },
    onError: () => toast.error('Failed to ignore transfer'),
  })

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header
        title="Unreconciled Transfers"
        description="Bank transfers into your Moniepoint account that couldn't be auto-matched to an order"
        icon={Landmark}
        badgeText={transfers?.length}
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : !transfers || transfers.length === 0 ? (
          <EmptyState icon={BankIcon} title="Nothing to reconcile" description="Every transfer so far has auto-matched cleanly" />
        ) : (
          <div className="flex flex-col gap-3">
            {transfers.map((t: MoniepointUnreconciledTransfer) => (
              <Card key={t.id} className="p-4">
                <CardContent className="p-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-bold text-foreground">{formatCurrency(Number(t.amount))}</div>
                      <div className="mt-1 text-sm text-muted-foreground">{t.matchReason}</div>
                      {t.senderMetadata && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          {t.senderMetadata.customerName && <div>From: {t.senderMetadata.customerName}</div>}
                          {t.senderMetadata.customerBank && <div>Bank: {t.senderMetadata.customerBank}</div>}
                          {t.senderMetadata.narration && <div className="italic">"{t.senderMetadata.narration}"</div>}
                        </div>
                      )}
                      <div className="mt-2 text-xs text-muted-foreground">{formatDateTime(t.createdAt)}</div>
                    </div>
                    {/* A single resolve-as dropdown rather than one button per path — wallet top-up and
                        "other" are just as valid an outcome as an order match, not an afterthought
                        next to a primary "Apply to Order" action. */}
                    <Select
                      className="w-auto min-w-[11rem] shrink-0"
                      value=""
                      onChange={(e) => {
                        const action = e.target.value
                        if (action === 'order') setAssignTarget(t)
                        else if (action === 'wallet') setWalletTarget(t)
                        else if (action === 'other') setIgnoreTarget(t)
                      }}
                    >
                      <option value="" disabled>
                        Resolve as…
                      </option>
                      <option value="order">Apply to Order</option>
                      <option value="wallet">Wallet Top-up</option>
                      <option value="other">Other / Ignore</option>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal isOpen={!!assignTarget} onClose={() => setAssignTarget(null)} title="Apply Transfer to Order">
        <div className="space-y-4">
          {assignTarget && (
            <p className="text-sm text-muted-foreground">
              Applying <span className="font-semibold text-foreground">{formatCurrency(Number(assignTarget.amount))}</span> to the
              selected order — it'll be marked paid and closed.
            </p>
          )}
          <SearchableSelect
            options={orderOptions}
            value={selectedOrderId}
            onChange={setSelectedOrderId}
            onSearchChange={setOrderSearch}
            placeholder="Search open orders by table…"
          />
          <Button
            className="w-full"
            disabled={!selectedOrderId}
            isLoading={assignMutation.isPending}
            onClick={() => assignTarget && assignMutation.mutate({ id: assignTarget.id, orderId: selectedOrderId })}
          >
            Apply
          </Button>
        </div>
      </Modal>

      <Modal isOpen={!!walletTarget} onClose={() => setWalletTarget(null)} title="Credit Customer Wallet">
        <div className="space-y-4">
          {walletTarget && (
            <p className="text-sm text-muted-foreground">
              Crediting <span className="font-semibold text-foreground">{formatCurrency(Number(walletTarget.amount))}</span> to the
              selected customer's wallet — not tied to any order.
            </p>
          )}
          <SearchableSelect
            options={customerOptions}
            value={selectedCustomerId}
            onChange={setSelectedCustomerId}
            onSearchChange={setCustomerSearch}
            placeholder="Search customers by name or phone…"
          />
          <Textarea
            placeholder="Optional note (e.g. sender detail that identified the customer)"
            value={walletNotes}
            onChange={(e) => setWalletNotes(e.target.value)}
          />
          <Button
            className="w-full"
            disabled={!selectedCustomerId}
            isLoading={walletMutation.isPending}
            onClick={() =>
              walletTarget && walletMutation.mutate({ id: walletTarget.id, customerId: selectedCustomerId, notes: walletNotes || undefined })
            }
          >
            Credit Wallet
          </Button>
        </div>
      </Modal>

      <Modal isOpen={!!ignoreTarget} onClose={() => setIgnoreTarget(null)} title="Ignore Transfer">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Mark this as not belonging to any order in Tarione.</p>
          <Textarea
            placeholder="Optional note (e.g. unrelated to the till)"
            value={ignoreNotes}
            onChange={(e) => setIgnoreNotes(e.target.value)}
          />
          <Button
            className="w-full"
            variant="outline"
            isLoading={ignoreMutation.isPending}
            onClick={() => ignoreTarget && ignoreMutation.mutate({ id: ignoreTarget.id, notes: ignoreNotes || undefined })}
          >
            Confirm Ignore
          </Button>
        </div>
      </Modal>
    </div>
  )
}
