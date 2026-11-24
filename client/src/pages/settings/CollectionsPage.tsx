import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Header } from '@/components/layout'
import { Button, Card, CardContent, Input, Label } from '@/components/ui'
import { invoiceCollectionsApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import type { AttentionItem, AttentionReason, CollectionMode, CollectionPolicy, PendingReminder } from '@/api'

const apiMessage = (error: any, fallback: string) => error?.response?.data?.message || fallback // eslint-disable-line @typescript-eslint/no-explicit-any

const STEP_LABELS: Record<string, string> = {
  pre_due: 'Heads-up before it is due',
  due: 'On the due date',
  payment_reminder: 'Friendly reminder',
  overdue_2: 'Second overdue notice',
}

const NOT_SENT_REASONS: Record<string, string> = {
  not_pending: 'Already handled',
  invoice_closed: 'The invoice is already paid or cancelled, so nothing was sent',
  no_consent: 'This customer has not agreed to WhatsApp messages',
  no_phone: 'This customer has no phone number',
  quiet_hours: 'Held back because it is outside sending hours (7am to 9pm). It stays in this list; send it in the morning',
  max_messages: 'This invoice has already had the most reminders you allow, so nothing was sent',
}

const ATTENTION_REASONS: Record<Exclude<AttentionReason, 'replied'>, string> = {
  opted_out: 'This customer asked to stop WhatsApp messages. Follow up another way.',
  no_consent: 'Could not be reminded: this customer has no phone number or has not agreed to WhatsApp messages.',
  all_sent: 'All reminders sent and no reply.',
  none_sent: 'No reminder was sent. Its reminder dates had already passed when reminders were switched on, or the reminders were skipped.',
}

const dayLabel = (n: number) => (n === 0 ? 'On the due date' : n < 0 ? `${-n} day${n === -1 ? '' : 's'} before due` : `${n} day${n === 1 ? '' : 's'} after due`)

const naira = (v: number | string) => `₦${Number(v).toLocaleString('en-NG')}`

function PolicyForm({ policy, canEdit }: { policy: CollectionPolicy; canEdit: boolean }) {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<CollectionMode>(policy.mode)
  const [sendHour, setSendHour] = useState(String(policy.sendHour))
  const [maxMessages, setMaxMessages] = useState(String(policy.maxMessages))

  const save = useMutation({
    mutationFn: invoiceCollectionsApi.updatePolicy,
    onSuccess: (saved) => {
      queryClient.setQueryData(['invoice-collections', 'policy'], saved)
      toast.success('Reminder settings saved')
    },
    onError: (e) => toast.error(apiMessage(e, 'Could not save settings')),
  })

  const hour = Number(sendHour)
  const max = Number(maxMessages)
  const valid = Number.isInteger(hour) && hour >= 7 && hour <= 20 && Number.isInteger(max) && max >= 1 && max <= 10

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Pause reminders</p>
            <p className="text-xs text-muted-foreground">Stops all new messages until you resume. Nothing is lost.</p>
          </div>
          {canEdit && (
            <Button variant="outline" onClick={() => save.mutate({ paused: !policy.paused })} disabled={save.isPending}>
              {policy.paused ? 'Resume' : 'Pause'}
            </Button>
          )}
        </div>

        <div>
          <Label>Before a reminder goes out</Label>
          <div className="mt-1 space-y-1">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="mode" disabled={!canEdit} checked={mode === 'APPROVE'} onChange={() => setMode('APPROVE')} />
              I approve each reminder first (recommended to start)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="mode" disabled={!canEdit} checked={mode === 'AUTO'} onChange={() => setMode('AUTO')} />
              Send automatically
            </label>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="send-hour">Send at (hour, 7 to 20)</Label>
            <Input id="send-hour" type="number" min={7} max={20} disabled={!canEdit} value={sendHour} onChange={(e) => setSendHour(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="max-messages">Most reminders per invoice</Label>
            <Input id="max-messages" type="number" min={1} max={10} disabled={!canEdit} value={maxMessages} onChange={(e) => setMaxMessages(e.target.value)} />
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold">Schedule</p>
          <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
            {policy.schedule.map((s, i) => (
              <li key={i}>
                {dayLabel(s.offsetDays)}: {STEP_LABELS[s.template] ?? s.template}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted-foreground">Messages are never sent between 9pm and 7am.</p>
        </div>

        {canEdit ? (
          <Button onClick={() => save.mutate({ mode, sendHour: hour, maxMessages: max })} disabled={!valid || save.isPending}>
            Save settings
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">Only an admin can change these settings.</p>
        )}
      </CardContent>
    </Card>
  )
}

function PendingList({ reminders }: { reminders: PendingReminder[] }) {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['invoice-collections', 'pending'] })

  const approve = useMutation({
    mutationFn: invoiceCollectionsApi.approve,
    onSuccess: (result) => {
      if (result.sent) toast.success('Reminder sent')
      else toast.error(NOT_SENT_REASONS[result.reason ?? ''] ?? 'Reminder was not sent')
      refresh()
    },
    onError: (e) => toast.error(apiMessage(e, 'Could not send reminder')),
  })
  const skip = useMutation({
    mutationFn: invoiceCollectionsApi.skip,
    onSuccess: () => {
      toast.success('Reminder skipped')
      refresh()
    },
    onError: (e) => toast.error(apiMessage(e, 'Could not skip reminder')),
  })
  const busy = approve.isPending || skip.isPending

  if (reminders.length === 0) return <p className="text-sm text-muted-foreground">No reminders waiting for you.</p>

  return (
    <div className="space-y-2">
      {reminders.map((r) => {
        const owing = Number(r.invoice.total) - Number(r.invoice.amountPaid)
        return (
          <Card key={r.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="text-sm font-semibold">
                  {r.invoice.client?.name ?? 'Customer'} · {r.invoice.invoiceNumber}
                </p>
                <p className="text-xs text-muted-foreground">
                  {naira(owing)} owing · due {new Date(r.invoice.dueDate).toLocaleDateString()} · {STEP_LABELS[r.template] ?? r.template}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" disabled={busy} onClick={() => skip.mutate(r.id)} aria-label={`Skip reminder for ${r.invoice.invoiceNumber}`}>
                  Skip
                </Button>
                <Button disabled={busy} onClick={() => approve.mutate(r.id)} aria-label={`Send reminder for ${r.invoice.invoiceNumber}`}>
                  Send
                </Button>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

const REPLY_LABELS: Record<string, string> = {
  CLAIMS_PAID: 'Says they have paid. Check your account, then record the payment.',
  OTHER: 'Replied. Reminders are paused until you look.',
  OPT_OUT: 'Asked to stop messages.',
}

function AttentionList({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Nothing needs your attention.</p>
  return (
    <div className="space-y-2">
      {items.map((item) => {
        const owing = Number(item.invoice.total) - Number(item.invoice.amountPaid)
        const reply = item.lastReply
        return (
          <Card key={item.invoiceId}>
            <CardContent className="space-y-1 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">
                  {item.invoice.client?.name ?? 'Customer'} · {item.invoice.invoiceNumber}
                </p>
                <Link to={`/invoices/${item.invoice.id}`} className="text-sm font-medium text-primary underline-offset-2 hover:underline">
                  Open invoice
                </Link>
              </div>
              <p className="text-xs text-muted-foreground">
                {naira(owing)} owing · due {new Date(item.invoice.dueDate).toLocaleDateString()}
              </p>
              {reply ? (
                <>
                  <p className="text-sm">“{reply.body}”</p>
                  <p className="text-xs text-muted-foreground">{REPLY_LABELS[reply.intent ?? 'OTHER'] ?? REPLY_LABELS.OTHER}</p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {item.reason === 'replied' ? ATTENTION_REASONS.all_sent : ATTENTION_REASONS[item.reason]}
                </p>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

export function CollectionsPage() {
  const queryClient = useQueryClient()
  const userRoles = useAuthStore((state) => state.user?.roles) ?? []
  // Changing the policy is admin-only on the API; everyone else can still approve, skip and read.
  const canEditPolicy = userRoles.includes('SUPER_ADMIN') || userRoles.includes('ADMIN')
  const policy = useQuery({ queryKey: ['invoice-collections', 'policy'], queryFn: invoiceCollectionsApi.policy })
  const pending = useQuery({ queryKey: ['invoice-collections', 'pending'], queryFn: invoiceCollectionsApi.pending, enabled: policy.data?.enabled === true })

  const attention = useQuery({ queryKey: ['invoice-collections', 'attention'], queryFn: invoiceCollectionsApi.attention, enabled: policy.data?.enabled === true })

  const enable = useMutation({
    mutationFn: () => invoiceCollectionsApi.updatePolicy({ mode: 'APPROVE' }),
    onSuccess: (saved) => {
      queryClient.setQueryData(['invoice-collections', 'policy'], saved)
      toast.success('Automatic reminders are on. You will approve each one first.')
    },
    onError: (e) => toast.error(apiMessage(e, 'Could not turn on reminders')),
  })

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header title="Automatic reminders" description="Chase overdue invoices on WhatsApp" />
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {policy.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !policy.data ? (
            <p className="text-sm text-red-600">Could not load reminder settings</p>
          ) : !policy.data.enabled ? (
            <Card>
              <CardContent className="space-y-3 p-4">
                <p className="text-sm">
                  Tarione can message customers on WhatsApp before and after an invoice is due, with a link to pay. Reminders only go to customers who agreed to WhatsApp messages. You approve each one until you choose otherwise.
                </p>
                {canEditPolicy ? (
                  <Button onClick={() => enable.mutate()} disabled={enable.isPending}>
                    Turn on reminders
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">Ask an admin to turn on reminders.</p>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="space-y-2">
                <p className="text-sm font-semibold">Needs your attention</p>
                {attention.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : <AttentionList items={attention.data ?? []} />}
              </div>
              <PolicyForm key={`${policy.data.mode}-${policy.data.sendHour}-${policy.data.maxMessages}`} policy={policy.data} canEdit={canEditPolicy} />
              <div className="space-y-2">
                <p className="text-sm font-semibold">Waiting for your approval</p>
                {pending.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : <PendingList reminders={pending.data ?? []} />}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default CollectionsPage
