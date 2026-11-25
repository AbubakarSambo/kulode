import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Coins, Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import { Coins01Icon } from '@hugeicons/core-free-icons'
import { Header } from '@/components/layout'
import { Button, Card, CardContent, EmptyState, Input, Label } from '@/components/ui'
import { Modal } from '@/components/shared/Modal'
import { tipsApi } from '@/api'
import type { TipOwedRow, TipSettings } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { can } from '@/lib/permissions'
import { businessToday, formatYmd } from '@/lib/reportPeriods'
import { cn, formatCurrency, formatDateTime } from '@/lib/utils'

const errorMessage = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback

function SettingsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { data: settings } = useQuery({ queryKey: ['tip-settings'], queryFn: tipsApi.settings, enabled: isOpen })
  const [draft, setDraft] = useState<{ enabled: boolean; presetsText: string } | null>(null)
  const form = draft ?? (settings ? { enabled: settings.enabled, presetsText: settings.presets.join(', ') } : null)

  const save = useMutation({
    mutationFn: (data: Partial<TipSettings>) => tipsApi.updateSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tip-settings'] })
      toast.success('Tip settings saved')
      setDraft(null)
      onClose()
    },
    onError: (err) => toast.error(errorMessage(err, 'Failed to save tip settings')),
  })

  if (!form) return null
  const presets = form.presetsText
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number)
  const presetsValid = presets.length > 0 && presets.length <= 6 && presets.every((n) => Number.isInteger(n) && n >= 100 && n <= 1_000_000)

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Tip settings" description="Card and transfer tips only — cash tips stay out of the system.">
      <div className="space-y-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setDraft({ ...form, enabled: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300"
          />
          <span className="text-sm font-medium">Let guests add a tip at checkout</span>
        </label>
        <div>
          <Label htmlFor="tipPresets">Quick-pick amounts (₦)</Label>
          <Input
            id="tipPresets"
            value={form.presetsText}
            onChange={(e) => setDraft({ ...form, presetsText: e.target.value })}
            placeholder="1000, 3000, 5000"
          />
          <p className="mt-1 text-xs text-muted-foreground">Up to 6 whole-Naira amounts, separated by commas. “Custom” and “No tip” always show.</p>
        </div>
        <Button className="w-full" isLoading={save.isPending} disabled={!presetsValid} onClick={() => save.mutate({ enabled: form.enabled, presets })}>
          Save
        </Button>
      </div>
    </Modal>
  )
}

function PayoutModal({ row, onClose, needsPin }: { row: TipOwedRow | null; onClose: () => void; needsPin: boolean }) {
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState('')
  const [paidFrom, setPaidFrom] = useState<'CASH_DRAWER' | 'BANK'>('CASH_DRAWER')
  const [pin, setPin] = useState('')
  const [note, setNote] = useState('')
  // One id per modal opening, so a double-tap can never pay twice.
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())

  const pay = useMutation({
    mutationFn: () =>
      tipsApi.payout({
        waiterId: row?.waiterId ?? undefined,
        amount: Number(amount),
        paidFrom,
        approverPin: needsPin ? pin : undefined,
        note: note.trim() || undefined,
        clientRequestId: requestId,
      }),
    onSuccess: (res) => {
      toast.success(`Paid out ${formatCurrency(res.amount)} — ${formatCurrency(res.balance)} still owed`)
      queryClient.invalidateQueries({ queryKey: ['tips-owed'] })
      queryClient.invalidateQueries({ queryKey: ['tips-ledger'] })
      setAmount('')
      setPin('')
      setNote('')
      setRequestId(crypto.randomUUID())
      onClose()
    },
    onError: (err) => toast.error(errorMessage(err, 'Failed to record payout')),
  })

  if (!row) return null
  const value = Number(amount)
  const valid = value > 0 && value <= row.balance + 0.001 && (!needsPin || pin.length >= 4)

  return (
    <Modal isOpen onClose={onClose} title={`Pay out ${row.name}`} description={`${formatCurrency(row.balance)} owed`}>
      <div className="space-y-4">
        <div>
          <Label htmlFor="payoutAmount">Amount (₦)</Label>
          <div className="flex gap-2">
            <Input id="payoutAmount" type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`Up to ${row.balance}`} />
            <Button type="button" variant="outline" onClick={() => setAmount(String(row.balance))}>
              All
            </Button>
          </div>
        </div>
        <div>
          <Label>Paid from</Label>
          <div className="mt-1 flex gap-2">
            {(
              [
                { value: 'CASH_DRAWER', label: 'Cash from the till' },
                { value: 'BANK', label: 'Bank / transfer' },
              ] as const
            ).map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setPaidFrom(o.value)}
                className={cn('cursor-pointer rounded-full px-4 py-2 text-sm font-medium', paidFrom === o.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}
              >
                {o.label}
              </button>
            ))}
          </div>
          {paidFrom === 'CASH_DRAWER' && <p className="mt-1 text-xs text-muted-foreground">The till will expect this much less cash when the shift closes.</p>}
        </div>
        {needsPin && (
          <div>
            <Label htmlFor="payoutPin">Manager / supervisor PIN</Label>
            <Input id="payoutPin" type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value)} />
          </div>
        )}
        <div>
          <Label htmlFor="payoutNote">Note (optional)</Label>
          <Input id="payoutNote" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <Button className="w-full" isLoading={pay.isPending} disabled={!valid} onClick={() => pay.mutate()}>
          Mark as paid
        </Button>
      </div>
    </Modal>
  )
}

function LedgerModal({ row, onClose }: { row: TipOwedRow | null; onClose: () => void }) {
  const { data: entries, isLoading } = useQuery({
    queryKey: ['tips-ledger', row?.waiterId ?? 'unassigned'],
    queryFn: () => tipsApi.ledger(row?.waiterId ?? undefined),
    enabled: !!row,
  })
  if (!row) return null
  const LABEL = { EARNED: 'Tip earned', VOIDED: 'Tip voided (bill cancelled)', PAYOUT: 'Paid out' } as const
  return (
    <Modal isOpen onClose={onClose} title={`${row.name} — tip ledger`} description={`Balance owed ${formatCurrency(row.balance)}`}>
      <div className="max-h-[60vh] space-y-1 overflow-auto">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {entries?.length === 0 && <p className="text-sm text-muted-foreground">Nothing yet.</p>}
        {entries?.map((e) => (
          <div key={e.id} className="flex items-start justify-between gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted/50">
            <div>
              <p className="font-medium text-foreground">{LABEL[e.type]}</p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(e.createdAt)}
                {e.type === 'PAYOUT' && ` · ${e.paidFrom === 'CASH_DRAWER' ? 'from the till' : 'bank'}${e.approvedBy ? ` · approved by ${e.approvedBy}` : ''}`}
                {e.note ? ` · ${e.note}` : ''}
              </p>
            </div>
            <p className={cn('shrink-0 font-semibold tabular-nums', e.amount < 0 ? 'text-destructive' : 'text-foreground')}>{formatCurrency(e.amount)}</p>
          </div>
        ))}
      </div>
    </Modal>
  )
}

export function TipsPage() {
  const user = useAuthStore((s) => s.user)
  const canConfigure = can(user, 'TIPS_CONFIGURE')
  // Anyone below supervisor needs a supervisor's PIN to record a payout — the server decides, this
  // only decides whether to ask.
  const needsPin = !can(user, 'ORDER_APPROVE')

  const today = formatYmd(businessToday(new Date()))
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [payoutRow, setPayoutRow] = useState<TipOwedRow | null>(null)
  const [ledgerRow, setLedgerRow] = useState<TipOwedRow | null>(null)

  const rangeOk = from <= to
  const { data: report, isLoading } = useQuery({
    queryKey: ['tips-owed', from, to],
    queryFn: () => tipsApi.owed({ from, to }),
    enabled: rangeOk,
  })
  const { data: settings } = useQuery({ queryKey: ['tip-settings'], queryFn: tipsApi.settings })

  const controls = (
    <div className="flex flex-wrap items-center gap-2">
      <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-11 w-auto" aria-label="From" />
      <span className="text-xs text-muted-foreground">to</span>
      <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="h-11 w-auto" aria-label="To" />
      {canConfigure && (
        <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => setSettingsOpen(true)} aria-label="Tip settings">
          <Settings2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  )

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header title="Tips owed" description="Card and transfer tips held for staff" icon={Coins} action={controls} />
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {settings && !settings.enabled && (
            <Card>
              <CardContent className="p-4 text-sm text-muted-foreground">
                Tipping is switched off, so guests aren’t being offered it at checkout.{' '}
                {canConfigure ? (
                  <button className="font-medium text-primary hover:underline" onClick={() => setSettingsOpen(true)}>
                    Turn it on
                  </button>
                ) : (
                  'An admin can turn it on.'
                )}
              </CardContent>
            </Card>
          )}

          {!rangeOk && <p className="text-sm text-destructive">The “from” date has to be on or before the “to” date.</p>}
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {report && report.rows.length === 0 && (
            <EmptyState icon={Coins01Icon} title="No tips for this period" description="Nothing owed, and nothing earned in these dates." />
          )}

          {report && report.rows.length > 0 && (
            <Card>
              <CardContent className="divide-y divide-border p-0">
                <div className="hidden grid-cols-[1fr_repeat(4,5.5rem)_auto] gap-3 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
                  <span>Waiter</span>
                  <span className="text-right">Brought in</span>
                  <span className="text-right">Earned</span>
                  <span className="text-right">Paid out</span>
                  <span className="text-right">Owed</span>
                  <span className="w-32" />
                </div>
                {report.rows.map((r) => (
                  <div key={r.waiterId ?? 'unassigned'} className="grid gap-x-3 gap-y-1 px-4 py-3 sm:grid-cols-[1fr_repeat(4,5.5rem)_auto] sm:items-center">
                    <span className="text-sm font-semibold text-foreground">{r.name}</span>
                    <span className="text-right text-sm tabular-nums text-muted-foreground">{formatCurrency(r.openingBalance)}</span>
                    <span className="text-right text-sm tabular-nums text-foreground">{formatCurrency(r.earned + r.voided)}</span>
                    <span className="text-right text-sm tabular-nums text-foreground">{formatCurrency(r.paidOut)}</span>
                    <span className={cn('text-right text-sm font-bold tabular-nums', r.balance < 0 ? 'text-destructive' : 'text-foreground')}>{formatCurrency(r.balance)}</span>
                    <span className="flex w-32 justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => setLedgerRow(r)}>
                        Ledger
                      </Button>
                      <Button size="sm" disabled={r.balance <= 0} onClick={() => setPayoutRow(r)}>
                        Pay out
                      </Button>
                    </span>
                  </div>
                ))}
                <div className="flex justify-between px-4 py-3 text-sm font-semibold">
                  <span>Total owed</span>
                  <span className="tabular-nums">{formatCurrency(report.totals.balance)}</span>
                </div>
              </CardContent>
            </Card>
          )}
          <p className="text-xs text-muted-foreground">
            “Brought in” is what was already owed before the first day; anything unpaid carries forward. Earned is net of tips voided when a bill is cancelled. A waiter owed a negative amount was paid a tip that was later voided — it comes off their next payout.
          </p>
        </div>
      </div>

      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <PayoutModal row={payoutRow} onClose={() => setPayoutRow(null)} needsPin={needsPin} />
      <LedgerModal row={ledgerRow} onClose={() => setLedgerRow(null)} />
    </div>
  )
}
