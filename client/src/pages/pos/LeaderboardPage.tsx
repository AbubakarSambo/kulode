import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Settings2, Trophy } from 'lucide-react'
import { toast } from 'sonner'
import { Header } from '@/components/layout'
import { Button, Card, CardContent, DropdownPanel, EmptyState, Input, Label } from '@/components/ui'
import { Modal } from '@/components/shared/Modal'
import { leaderboardApi, organizationsApi } from '@/api'
import type { LeaderboardEntry, LeaderboardMetric, LeaderboardRole, LeaderboardSettings } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { can } from '@/lib/permissions'
import { REPORT_PERIOD_OPTIONS, reportPeriodRange, businessToday, formatYmd, type ReportsPeriod } from '@/lib/reportPeriods'
import { cn, formatCurrency } from '@/lib/utils'

// A leaderboard is about "how am I doing lately", not ad-hoc ranges.
const PERIODS = REPORT_PERIOD_OPTIONS.filter((o) => ['TODAY', 'YESTERDAY', 'LAST_WEEK', 'THIS_MONTH', 'LAST_MONTH'].includes(o.value))

const METRIC_LABEL: Record<LeaderboardMetric, string> = { REVENUE: 'Revenue', AVG_CHECK: 'Average check' }
const ROLE_LABEL: Record<LeaderboardRole, string> = { WAITER: 'Waiters', CASHIER: 'Cashiers' }

const MEDAL = ['bg-amber-100 text-amber-700', 'bg-slate-100 text-slate-600', 'bg-orange-100 text-orange-700']

function Row({ entry, metric }: { entry: LeaderboardEntry; metric: LeaderboardMetric }) {
  const value = metric === 'REVENUE' ? entry.revenue : entry.avgCheck
  return (
    <div className={cn('flex items-center gap-3 rounded-xl px-3 py-3', entry.isYou && 'bg-primary/5 ring-1 ring-primary/20')}>
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold',
          entry.rank <= 3 ? MEDAL[entry.rank - 1] : 'bg-muted text-muted-foreground',
        )}
      >
        {entry.rank}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-semibold text-foreground">
            {entry.name}
            {entry.isYou && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">You</span>}
          </p>
          {value !== null && <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{formatCurrency(value)}</p>}
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${entry.barPercent}%` }} />
        </div>
        {entry.isYou && entry.orders !== null && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            {entry.orders} orders · {formatCurrency(entry.revenue ?? 0)} sales · {formatCurrency(entry.avgCheck ?? 0)} avg check
          </p>
        )}
      </div>
    </div>
  )
}

function SettingsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { data: settings } = useQuery({ queryKey: ['leaderboard-settings'], queryFn: leaderboardApi.getSettings, enabled: isOpen })
  const [draft, setDraft] = useState<LeaderboardSettings | null>(null)
  const form = draft ?? settings

  const save = useMutation({
    mutationFn: (data: LeaderboardSettings) => leaderboardApi.updateSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] })
      queryClient.invalidateQueries({ queryKey: ['leaderboard-settings'] })
      toast.success('Leaderboard settings saved')
      setDraft(null)
      onClose()
    },
    onError: (error: any) => toast.error(error.response?.data?.message || 'Failed to save settings'), // eslint-disable-line @typescript-eslint/no-explicit-any
  })

  const toggle = <T extends string>(list: T[], value: T): T[] => {
    const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
    return next.length > 0 ? next : list // always keep at least one
  }
  const set = (patch: Partial<LeaderboardSettings>) => form && setDraft({ ...form, ...patch })

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Leaderboard settings" description="Choose what the leaderboard shows and who competes">
      {!form ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-5">
          <div>
            <Label>Rank by</Label>
            <div className="mt-2 space-y-2">
              {(['REVENUE', 'AVG_CHECK'] as const).map((m) => (
                <label key={m} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={form.metrics.includes(m)} onChange={() => set({ metrics: toggle(form.metrics, m) })} />
                  {METRIC_LABEL[m]}
                </label>
              ))}
            </div>
          </div>
          <div>
            <Label>Who competes</Label>
            <div className="mt-2 space-y-2">
              {(['WAITER', 'CASHIER'] as const).map((r) => (
                <label key={r} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={form.roles.includes(r)} onChange={() => set({ roles: toggle(form.roles, r) })} />
                  {ROLE_LABEL[r]}
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Places shown</Label>
              <Input type="number" min={1} max={20} value={form.topN} onChange={(e) => set({ topN: Math.min(20, Math.max(1, Number(e.target.value) || 1)) })} />
            </div>
            <div>
              <Label>Min. orders (avg check)</Label>
              <Input type="number" min={1} max={100} value={form.minOrders} onChange={(e) => set({ minOrders: Math.min(100, Math.max(1, Number(e.target.value) || 1)) })} />
            </div>
          </div>
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-gray-300" checked={form.showAmountsToAll} onChange={(e) => set({ showAmountsToAll: e.target.checked })} />
            <span className="text-sm">
              <span className="font-medium">Show everyone's amounts to all staff</span>
              <span className="block text-xs text-muted-foreground">Off: staff see everyone's rank and a bar, but real amounts only for themselves. Managers and admins always see everything.</span>
            </span>
          </label>
          <Button className="w-full" isLoading={save.isPending} onClick={() => save.mutate(form)}>
            Save settings
          </Button>
        </div>
      )}
    </Modal>
  )
}

export function LeaderboardPage() {
  const user = useAuthStore((state) => state.user)
  const canConfigure = can(user, 'LEADERBOARD_CONFIGURE')
  const { data: organization } = useQuery({ queryKey: ['organization'], queryFn: () => organizationsApi.getCurrent() })

  const [period, setPeriod] = useState<Exclude<ReportsPeriod, 'CUSTOM'>>('THIS_MONTH')
  const [metric, setMetric] = useState<LeaderboardMetric | undefined>(undefined)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const shiftStartTime = organization?.shiftStartTime
  const { from, to } = useMemo(() => reportPeriodRange(period as Exclude<ReportsPeriod, 'CUSTOM'>, new Date(), shiftStartTime), [period, shiftStartTime])
  const today = formatYmd(businessToday(new Date(), shiftStartTime))

  const { data, isLoading } = useQuery({
    queryKey: ['leaderboard', from, to, metric, today],
    queryFn: () => leaderboardApi.get({ from, to, metric }),
    // A board people glance at through the shift — keep it fresh without a manual reload.
    refetchInterval: 60_000,
  })

  const activeMetric = data?.metric ?? metric ?? 'REVENUE'
  const showingYou = data?.you && !data.entries.some((e) => e.isYou)
  const activeOption = PERIODS.find((p) => p.value === period)

  const controls = (
    <div className="flex items-center gap-2 print:hidden">
      {data && data.settings.metrics.length > 1 && (
        <div className="flex h-11 items-center gap-1 rounded-xl border border-border bg-card p-1">
          {data.settings.metrics.map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={cn('h-full rounded-lg px-3 text-xs font-semibold transition-colors', activeMetric === m ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground')}
            >
              {METRIC_LABEL[m]}
            </button>
          ))}
        </div>
      )}
      <div className="relative inline-block text-left">
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="flex h-11 min-w-[140px] items-center justify-between gap-2.5 rounded-xl border border-border bg-card px-4 text-xs font-semibold text-foreground hover:bg-muted/50"
        >
          <span>{activeOption?.label}</span>
          <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', dropdownOpen && 'rotate-180')} />
        </button>
        <DropdownPanel isOpen={dropdownOpen} onClose={() => setDropdownOpen(false)} align="right" widthClass="w-48" zIndexClass="z-20">
          {PERIODS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                setPeriod(opt.value as Exclude<ReportsPeriod, 'CUSTOM'>)
                setDropdownOpen(false)
              }}
              className={cn('block w-full px-4 py-2.5 text-left text-xs font-semibold transition-colors', period === opt.value ? 'bg-primary/5 text-primary' : 'text-foreground hover:bg-muted/50')}
            >
              {opt.label}
            </button>
          ))}
        </DropdownPanel>
      </div>
      {canConfigure && (
        <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => setSettingsOpen(true)} aria-label="Leaderboard settings">
          <Settings2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  )

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header title="Leaderboard" description="Who's leading on the floor" icon={Trophy} action={controls} />

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-2xl space-y-4">
          {!isLoading && data && data.entries.length === 0 && (
            <EmptyState
              icon={Trophy}
              title="Nobody on the board yet"
              description={
                activeMetric === 'AVG_CHECK'
                  ? `Average check needs at least ${data.settings.minOrders} orders in the period. Try Revenue, or a longer period.`
                  : 'Once orders are paid in this period, the ranking appears here.'
              }
            />
          )}

          {data && data.entries.length > 0 && (
            <Card>
              <CardContent className="space-y-1 p-3">
                <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {METRIC_LABEL[activeMetric]} · {activeOption?.label}
                </p>
                {data.entries.map((e) => (
                  <Row key={e.userId} entry={e} metric={activeMetric} />
                ))}
                {showingYou && data.you && (
                  <>
                    <p className="px-3 py-1 text-center text-xs text-muted-foreground">···</p>
                    <Row entry={data.you} metric={activeMetric} />
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {data && data.entries.length > 0 && !data.you && data.canCompete && (
            <p className="text-center text-xs text-muted-foreground">
              {activeMetric === 'AVG_CHECK'
                ? `You'll appear once you have ${data.settings.minOrders} paid orders in this period.`
                : "You'll appear once you've taken a paid order in this period."}
            </p>
          )}
        </div>
      </div>

      {canConfigure && <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
