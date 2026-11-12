import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Modal } from '@/components/shared/Modal'
import { Button, Input, Label, Select } from '@/components/ui'
import { collectionApi, usersApi } from '@/api'
import type { CollectionPeriod, CollectionPeriodInput, CollectionRole, UserData } from '@/api'

const ROLES: { value: CollectionRole; label: string }[] = [
  { value: 'WAITER', label: 'Waiters' },
  { value: 'CASHIER', label: 'Cashiers' },
  { value: 'SUPERVISOR', label: 'Supervisors' },
  { value: 'MANAGER', label: 'Managers' },
]

type Draft = {
  name: string
  startDate: string
  endDate: string
  rolesInScope: CollectionRole[]
  minimum: string
  threshold: string
  rewardAmount: string
  deductionPct: string
  coverageGoalPct: string
}

const EMPTY: Draft = {
  name: '',
  startDate: '',
  endDate: '',
  rolesInScope: ['WAITER'],
  minimum: '',
  threshold: '',
  rewardAmount: '0',
  deductionPct: '0',
  coverageGoalPct: '70',
}

const fromPeriod = (p: CollectionPeriod): Draft => ({
  name: p.name,
  startDate: p.startDate,
  endDate: p.endDate,
  rolesInScope: p.rolesInScope,
  minimum: String(p.minimum),
  threshold: String(p.threshold),
  rewardAmount: String(Number(p.rewardAmount)),
  deductionPct: String(p.deductionPct),
  coverageGoalPct: String(p.coverageGoalPct),
})

const toInput = (d: Draft): CollectionPeriodInput => ({
  name: d.name.trim(),
  startDate: d.startDate,
  endDate: d.endDate,
  rolesInScope: d.rolesInScope,
  minimum: Number(d.minimum),
  threshold: Number(d.threshold),
  rewardAmount: Number(d.rewardAmount) || 0,
  deductionPct: Math.round(Number(d.deductionPct)) || 0,
  coverageGoalPct: Math.round(Number(d.coverageGoalPct)) || 70,
})

const apiMessage = (error: any, fallback: string) => error?.response?.data?.message || fallback // eslint-disable-line @typescript-eslint/no-explicit-any

function OverrideRow({ period, person }: { period: CollectionPeriod; person: Pick<UserData, 'id' | 'firstName' | 'lastName'> }) {
  const queryClient = useQueryClient()
  const existing = period.overrides.find((o) => o.userId === person.id)
  const [opening, setOpening] = useState(String(existing?.openingCount ?? 0))
  const [min, setMin] = useState(existing?.minimum ? String(existing.minimum) : '')
  const [thr, setThr] = useState(existing?.threshold ? String(existing.threshold) : '')

  const save = useMutation({
    mutationFn: () =>
      collectionApi.setOverride(period.id, person.id, {
        openingCount: Math.max(0, Math.round(Number(opening) || 0)),
        // Blank means "use the period's target"; only filled values are sent.
        ...(min ? { minimum: Number(min) } : {}),
        ...(thr ? { threshold: Number(thr) } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection-periods'] })
      queryClient.invalidateQueries({ queryKey: ['collection-board'] })
      toast.success(`${person.firstName} updated`)
    },
    onError: (error) => toast.error(apiMessage(error, 'Failed to save')),
  })

  return (
    <div className="grid grid-cols-[1fr_72px_64px_64px_auto] items-center gap-2">
      <span className="truncate text-sm font-medium">
        {person.firstName} {person.lastName}
      </span>
      <Input type="number" min={0} value={opening} onChange={(e) => setOpening(e.target.value)} aria-label={`${person.firstName} opening count`} />
      <Input type="number" min={1} value={min} onChange={(e) => setMin(e.target.value)} placeholder={String(period.minimum)} aria-label={`${person.firstName} minimum`} />
      <Input type="number" min={1} value={thr} onChange={(e) => setThr(e.target.value)} placeholder={String(period.threshold)} aria-label={`${person.firstName} threshold`} />
      <Button size="sm" variant="outline" disabled={period.status === 'LOCKED'} isLoading={save.isPending} onClick={() => save.mutate()}>
        Save
      </Button>
    </div>
  )
}

function PeriodEditor({ current, onSaved }: { current: CollectionPeriod | null; onSaved: (id: string) => void }) {
  const queryClient = useQueryClient()
  // Mounted per selected period (keyed by the parent), so the draft starts from the right values.
  const [draft, setDraft] = useState<Draft>(() => (current ? fromPeriod(current) : EMPTY))

  const { data: staff } = useQuery({
    queryKey: ['staff-directory', 'collection', draft.rolesInScope.join(',')],
    queryFn: () => usersApi.directory(draft.rolesInScope),
    enabled: !!current,
  })

  const save = useMutation({
    mutationFn: () => (current ? collectionApi.updatePeriod(current.id, toInput(draft)) : collectionApi.createPeriod(toInput(draft))),
    onSuccess: (period) => {
      queryClient.invalidateQueries({ queryKey: ['collection-periods'] })
      queryClient.invalidateQueries({ queryKey: ['collection-board'] })
      onSaved(period.id)
      toast.success('Collection period saved')
    },
    onError: (error) => toast.error(apiMessage(error, 'Failed to save period')),
  })

  const locked = current?.status === 'LOCKED'
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const toggleRole = (role: CollectionRole) =>
    set({ rolesInScope: draft.rolesInScope.includes(role) ? draft.rolesInScope.filter((r) => r !== role) : [...draft.rolesInScope, role] })
  const valid = draft.name.trim() && draft.startDate && draft.endDate && draft.rolesInScope.length > 0 && Number(draft.minimum) >= 1 && Number(draft.threshold) >= Number(draft.minimum)

  return (
    <>
      <fieldset disabled={locked} className="space-y-4">
        <div>
          <Label>Name</Label>
          <Input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. November phone drive" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Starts</Label>
            <Input type="date" value={draft.startDate} onChange={(e) => set({ startDate: e.target.value })} />
          </div>
          <div>
            <Label>Ends</Label>
            <Input type="date" value={draft.endDate} onChange={(e) => set({ endDate: e.target.value })} />
          </div>
        </div>
        <div>
          <Label>Who takes part</Label>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
            {ROLES.map((r) => (
              <label key={r.value} className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={draft.rolesInScope.includes(r.value)} onChange={() => toggleRole(r.value)} />
                {r.label}
              </label>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Minimum numbers each</Label>
            <Input type="number" min={1} value={draft.minimum} onChange={(e) => set({ minimum: e.target.value })} />
          </div>
          <div>
            <Label>Reward threshold each</Label>
            <Input type="number" min={1} value={draft.threshold} onChange={(e) => set({ threshold: e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>Incentive (₦)</Label>
            <Input type="number" min={0} value={draft.rewardAmount} onChange={(e) => set({ rewardAmount: e.target.value })} />
          </div>
          <div>
            <Label>Deduction (%)</Label>
            <Input type="number" min={0} max={100} value={draft.deductionPct} onChange={(e) => set({ deductionPct: e.target.value })} />
          </div>
          <div>
            <Label>Coverage goal (%)</Label>
            <Input type="number" min={1} max={100} value={draft.coverageGoalPct} onChange={(e) => set({ coverageGoalPct: e.target.value })} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Below the minimum at the end is Red (deduction flagged), at or above the threshold is Green (incentive flagged). TariOne only flags the outcome; payroll applies the money.
        </p>
        <Button className="w-full" disabled={!valid} isLoading={save.isPending} onClick={() => save.mutate()}>
          {current ? 'Save period' : 'Create period'}
        </Button>
      </fieldset>

      {current && (
        <div className="space-y-2 border-t border-border pt-4">
          <div>
            <p className="text-sm font-semibold">Opening counts and personal targets</p>
            <p className="text-xs text-muted-foreground">
              Opening count = numbers collected before TariOne could credit them. Leave a target blank to use the period's.
            </p>
          </div>
          <div className="grid grid-cols-[1fr_72px_64px_64px_auto] gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Staff</span>
            <span>Opening</span>
            <span>Min</span>
            <span>Reward</span>
            <span />
          </div>
          {staff?.map((s) => (
            <OverrideRow key={`${current.id}-${s.id}`} period={current} person={s} />
          ))}
        </div>
      )}
    </>
  )
}

/** Admin: define a collection period (dates, who takes part, targets) and give people their own targets or opening counts. */
export function CollectionSettingsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { data: periods } = useQuery({ queryKey: ['collection-periods'], queryFn: collectionApi.periods, enabled: isOpen })
  const [selected, setSelected] = useState<string | 'new' | null>(null)

  // Land on the newest period, or on the new-period form when none exists yet.
  const effective = selected ?? (periods ? (periods[0]?.id ?? 'new') : null)
  const current = periods?.find((p) => p.id === effective) ?? null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Phone collection" description="A drive to collect customer phone numbers, with a target per person" className="max-w-2xl">
      {effective === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-5">
          <div>
            <Label>Period</Label>
            <Select value={effective} onChange={(e) => setSelected(e.target.value)}>
              {periods?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.startDate} → {p.endDate}){p.status === 'LOCKED' ? ' · locked' : ''}
                </option>
              ))}
              <option value="new">+ New period</option>
            </Select>
          </div>
          <PeriodEditor key={effective} current={current} onSaved={setSelected} />
        </div>
      )}
    </Modal>
  )
}
