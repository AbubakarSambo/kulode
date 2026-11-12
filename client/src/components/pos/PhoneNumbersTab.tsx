import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ClipboardList, ListChecks, Phone, Settings2, UserPlus } from 'lucide-react'
import { Award01Icon } from '@hugeicons/core-free-icons'
import { Button, Card, CardContent, EmptyState } from '@/components/ui'
import { collectionApi } from '@/api'
import type { CollectionBoard, CollectionEntry } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { can } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { CollectionSettingsModal } from './CollectionSettingsModal'
import { ZoneChip } from './ZoneChip'
import { ZONE_STYLE } from './zoneStyle'
import { PeriodOutcomeModal } from './PeriodOutcomeModal'
import { PhoneCreditsModal } from './PhoneCreditsModal'
import { QuickAddCustomerModal } from './QuickAddCustomerModal'

function pct(part: number, whole: number) {
  return whole > 0 ? Math.min(100, Math.round((part / whole) * 100)) : 0
}

function ProgressBar({ value, goal, className }: { value: number; goal: number; className?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className={cn('h-full rounded-full', className ?? 'bg-primary')} style={{ width: `${pct(value, goal)}%` }} />
    </div>
  )
}

export function PhoneRow({ entry }: { entry: CollectionEntry }) {
  return (
    <div className={cn('flex items-center gap-3 rounded-xl px-3 py-3', entry.isMe && 'bg-primary/5 ring-1 ring-primary/20')}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">{entry.rank}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-semibold text-foreground">
            {entry.name}
            {entry.isMe && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">You</span>}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <ZoneChip zone={entry.zone} />
            <p className="text-sm font-semibold tabular-nums text-foreground">{entry.count}</p>
          </div>
        </div>
        <ProgressBar value={entry.count} goal={entry.threshold} className={ZONE_STYLE[entry.zone].bar} />
        <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            Today {entry.today} · Target {entry.minimum} / {entry.threshold}
          </span>
          <span className="font-medium">{entry.nextStep}</span>
        </div>
      </div>
    </div>
  )
}

function TopBar({ board }: { board: CollectionBoard }) {
  const { team, coverage, period } = board
  if (!team || !coverage || !period) return null
  return (
    <Card>
      <CardContent className="grid gap-4 p-4 sm:grid-cols-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Customers with a phone number</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {coverage.pct}% <span className="text-sm font-medium text-muted-foreground">of {period.coverageGoalPct}% goal</span>
          </p>
          <ProgressBar value={coverage.pct} goal={period.coverageGoalPct} />
          <p className="mt-1 text-[11px] text-muted-foreground">
            {coverage.withPhone.toLocaleString()} of {coverage.customers.toLocaleString()} customers
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Team total this period</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {team.count.toLocaleString()} <span className="text-sm font-medium text-muted-foreground">of {team.threshold.toLocaleString()}</span>
          </p>
          <ProgressBar value={team.count} goal={team.threshold} />
          <p className="mt-1 text-[11px] text-muted-foreground">Team minimum {team.minimum.toLocaleString()}</p>
        </div>
      </CardContent>
    </Card>
  )
}

const PHASE_NOTE = { UPCOMING: 'Starts', LIVE: 'Live until', FINAL: 'Ended' } as const

export function PhoneNumbersTab() {
  const user = useAuthStore((state) => state.user)
  const canQuickAdd = can(user, 'PHONE_QUICK_ADD')
  const canReview = can(user, 'PHONE_CREDIT_REVOKE')
  const canConfigure = can(user, 'COLLECTION_CONFIGURE')
  const canSeeOutcome = can(user, 'COLLECTION_OUTCOME')
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [outcomeOpen, setOutcomeOpen] = useState(false)

  const { data: board, isLoading } = useQuery({
    queryKey: ['collection-board'],
    queryFn: () => collectionApi.leaderboard(),
    // Everyone sees the whole board; five minutes keeps it current without hammering the server.
    refetchInterval: 5 * 60_000,
  })

  const period = board?.period
  const me = board?.entries?.find((e) => e.isMe)

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {(canQuickAdd || canReview || canConfigure || canSeeOutcome) && (
        <div className="flex flex-wrap items-center justify-end gap-2 print:hidden">
          {canQuickAdd && period && (
            <Button size="sm" onClick={() => setQuickAddOpen(true)}>
              <UserPlus className="mr-1.5 h-4 w-4" /> Quick add
            </Button>
          )}
          {canReview && period && (
            <Button size="sm" variant="outline" onClick={() => setReviewOpen(true)}>
              <ListChecks className="mr-1.5 h-4 w-4" /> Review numbers
            </Button>
          )}
          {canSeeOutcome && period && (
            <Button size="sm" variant="outline" onClick={() => setOutcomeOpen(true)}>
              <ClipboardList className="mr-1.5 h-4 w-4" /> Outcome
            </Button>
          )}
          {canConfigure && (
            <Button size="sm" variant="outline" onClick={() => setSettingsOpen(true)}>
              <Settings2 className="mr-1.5 h-4 w-4" /> Set up
            </Button>
          )}
        </div>
      )}

      {!isLoading && board && !period && (
        <EmptyState
          icon={Award01Icon}
          title="No phone collection running"
          description={canConfigure ? 'Set up a collection period to start crediting staff for every new customer number they capture.' : 'When a collection drive starts, the ranking appears here.'}
        />
      )}

      {period && (
        <>
          <div className="flex items-center justify-between gap-2 px-1">
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Phone className="h-4 w-4 text-muted-foreground" />
              {period.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {PHASE_NOTE[period.phase]} {period.phase === 'UPCOMING' ? period.startDate : period.endDate}
              {period.status === 'LOCKED' && ' · locked'}
            </p>
          </div>
          {board && <TopBar board={board} />}
          {board?.entries && board.entries.length > 0 && (
            <Card>
              <CardContent className="space-y-1 p-3">
                {board.entries.map((e) => (
                  <PhoneRow key={e.userId} entry={e} />
                ))}
              </CardContent>
            </Card>
          )}
          {board?.entries?.length === 0 && <p className="text-center text-sm text-muted-foreground">Nobody is in scope for this period yet.</p>}
          {board?.canCompete && !me && <p className="text-center text-xs text-muted-foreground">You'll appear here once you're in scope for this period.</p>}
        </>
      )}

      {canQuickAdd && <QuickAddCustomerModal isOpen={quickAddOpen} onClose={() => setQuickAddOpen(false)} />}
      {canReview && <PhoneCreditsModal isOpen={reviewOpen} onClose={() => setReviewOpen(false)} periodId={period?.id} />}
      {canSeeOutcome && period && <PeriodOutcomeModal isOpen={outcomeOpen} onClose={() => setOutcomeOpen(false)} periodId={period.id} />}
      {canConfigure && <CollectionSettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
