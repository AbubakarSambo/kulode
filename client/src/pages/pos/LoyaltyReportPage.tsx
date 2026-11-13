import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Download } from 'lucide-react'
import { Header } from '@/components/layout'
import { Button, Card, CardContent, Input, Label } from '@/components/ui'
import { loyaltyApi } from '@/api'
import { formatCurrency, formatDate } from '@/lib/utils'

const apiMessage = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}

const KIND_LABEL = { WELCOME: 'Welcome message', REWARD_EARNED: 'Reward message' } as const

function UndeliveredMessages() {
  const queryClient = useQueryClient()
  const queue = useQuery({ queryKey: ['loyalty-undelivered'], queryFn: loyaltyApi.undelivered })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['loyalty-undelivered'] })
  const retry = useMutation({
    mutationFn: loyaltyApi.retryUndelivered,
    onSuccess: () => {
      toast.success('Queued to send again')
      refresh()
    },
    onError: (e) => toast.error(apiMessage(e, 'Could not retry')),
  })
  const resolve = useMutation({
    mutationFn: loyaltyApi.resolveUndelivered,
    onSuccess: () => {
      toast.success('Marked as followed up')
      refresh()
    },
    onError: (e) => toast.error(apiMessage(e, 'Could not update')),
  })

  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-sm font-semibold">Messages that did not arrive</h2>
        <p className="text-xs text-muted-foreground">
          WhatsApp messages that were refused or never delivered. Tell the customer in person or call them, then mark it followed up. WhatsApp limits how many marketing messages one person can receive, so a
          customer who gets many may not receive these.
        </p>
      </div>
      {queue.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !queue.data?.length ? (
        <p className="text-sm text-muted-foreground">Nothing to follow up — every message got through.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {queue.data.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {m.name} <span className="font-normal text-muted-foreground">· {KIND_LABEL[m.kind]}</span>
                </p>
                {m.rewardText && <p className="text-sm">Earned {m.rewardText}</p>}
                <p className="text-xs text-muted-foreground">
                  {m.phone ?? 'No number'} · {m.reason} · {formatDate(m.createdAt)}
                </p>
              </div>
              <div className="flex gap-2">
                {m.kind === 'WELCOME' && (
                  <Button size="sm" variant="outline" disabled={resolve.isPending} isLoading={retry.isPending && retry.variables === m.id} onClick={() => retry.mutate(m.id)}>
                    Send again
                  </Button>
                )}
                <Button size="sm" variant="outline" disabled={retry.isPending} isLoading={resolve.isPending && resolve.variables === m.id} onClick={() => resolve.mutate(m.id)}>
                  Followed up
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Coverage() {
  const coverage = useQuery({ queryKey: ['loyalty-coverage'], queryFn: () => loyaltyApi.coverage(60) })
  if (!coverage.data) return null
  const { live, days } = coverage.data
  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-sm font-semibold">Customers with a phone number</h2>
        <p className="text-xs text-muted-foreground">
          Today: {live.withPhone.toLocaleString()} of {live.customers.toLocaleString()} customers ({live.pct}%). History starts from the day this was switched on.
        </p>
      </div>
      {days.length === 0 ? (
        <p className="text-sm text-muted-foreground">No history yet — a figure is recorded each day.</p>
      ) : (
        <ul className="space-y-1" aria-label="Coverage by day">
          {[...days].reverse().map((d) => (
            <li key={d.date} className="flex items-center gap-3 text-xs">
              <span className="w-24 shrink-0 text-muted-foreground">{formatDate(d.date)}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" role="presentation">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, d.pct)}%` }} />
              </div>
              <span className="w-12 shrink-0 text-right font-medium">{d.pct}%</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Manager: how the loyalty programme is doing, who is signing members up, and who still needs a follow-up. */
export function LoyaltyReportPage() {
  // null = not touched yet (show the period the server chose); '' = cleared by the user.
  const [from, setFrom] = useState<string | null>(null)
  const [to, setTo] = useState<string | null>(null)
  const report = useQuery({ queryKey: ['loyalty-report', from, to], queryFn: () => loyaltyApi.report({ ...(from && { from }), ...(to && { to }) }) })
  const download = useMutation({ mutationFn: loyaltyApi.downloadMembersCsv, onError: (e) => toast.error(apiMessage(e, 'Failed to download the members')) })
  const r = report.data

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header title="Loyalty" description="Members, rewards and what they cost" />
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label>From</Label>
              <Input type="date" value={from ?? r?.range.from ?? ''} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
            </div>
            <div>
              <Label>To</Label>
              <Input type="date" value={to ?? r?.range.to ?? ''} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
            </div>
            <Button variant="outline" className="ml-auto" isLoading={download.isPending} onClick={() => download.mutate()}>
              <Download className="mr-1 h-4 w-4" /> Export members
            </Button>
          </div>

          {report.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : report.isError || !r ? (
            <p className="text-sm text-red-600">Could not load the loyalty report</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Members" value={r.members.total.toLocaleString()} hint={`${r.members.newInPeriod.toLocaleString()} joined in this period`} />
                <Stat label="Member share of spend" value={`${r.spend.memberSharePct}%`} hint={`${formatCurrency(r.spend.member)} of ${formatCurrency(r.spend.total)}`} />
                <Stat label="Rewards" value={`${r.rewards.earned} earned`} hint={`${r.rewards.redeemed} redeemed · ${r.rewards.expired} expired`} />
                <Stat label="Reward cost" value={formatCurrency(r.cost.foodCost)} hint={`${r.cost.pctOfMemberSpend}% of member spend · menu value ${formatCurrency(r.cost.menuValue)}`} />
              </div>
              <Stat label="Rewards waiting to be used" value={`${r.outstanding.rewards.toLocaleString()}`} hint={`Would cost ${formatCurrency(r.outstanding.foodCost)} if all were redeemed`} />

              <section className="space-y-2">
                <h2 className="text-sm font-semibold">New members by staff</h2>
                {r.members.byStaff.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nobody joined in this period.</p>
                ) : (
                  <ul className="divide-y divide-border rounded-xl border border-border">
                    {r.members.byStaff.map((s) => (
                      <li key={s.userId ?? 'unknown'} className="flex items-center justify-between p-3 text-sm">
                        <span>{s.name}</span>
                        <span className="font-semibold">{s.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}

          <Coverage />
          <UndeliveredMessages />
        </div>
      </div>
    </div>
  )
}

export default LoyaltyReportPage
