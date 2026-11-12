import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/shared/Modal'
import { Button, ConfirmDialog } from '@/components/ui'
import { collectionApi } from '@/api'
import type { OutcomeRow } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { can } from '@/lib/permissions'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ZoneChip } from './ZoneChip'

const apiMessage = (error: any, fallback: string) => error?.response?.data?.message || fallback // eslint-disable-line @typescript-eslint/no-explicit-any

function verdict(row: OutcomeRow) {
  if (row.zone === 'GREEN') return <span className="font-semibold text-emerald-700">{formatCurrency(row.incentiveAmount)} incentive</span>
  if (row.zone === 'RED') return <span className="font-semibold text-red-700">{row.deductionPct}% deduction</span>
  return <span className="text-muted-foreground">None</span>
}

/**
 * Who earned the incentive and who faces the service-charge deduction, with a CSV for payroll.
 * TariOne flags the outcome; payroll applies the money. Provisional until the period is locked.
 */
export function PeriodOutcomeModal({ isOpen, onClose, periodId }: { isOpen: boolean; onClose: () => void; periodId: string }) {
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const canLock = can(user, 'COLLECTION_CONFIGURE')
  const [confirmLock, setConfirmLock] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['collection-outcome', periodId],
    queryFn: () => collectionApi.outcome(periodId),
    enabled: isOpen,
  })

  const download = useMutation({
    mutationFn: () => collectionApi.downloadOutcomeCsv(periodId),
    onError: (error) => toast.error(apiMessage(error, 'Failed to download the CSV')),
  })

  const lock = useMutation({
    mutationFn: () => collectionApi.lockPeriod(periodId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection-outcome', periodId] })
      queryClient.invalidateQueries({ queryKey: ['collection-board'] })
      queryClient.invalidateQueries({ queryKey: ['collection-periods'] })
      toast.success('Period locked — the outcome is now final')
      setConfirmLock(false)
    },
    onError: (error) => {
      toast.error(apiMessage(error, 'Failed to lock the period'))
      setConfirmLock(false)
    },
  })

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Period outcome" description={data ? `${data.period.name} · ${data.period.startDate} → ${data.period.endDate}` : undefined} className="max-w-2xl">
      {isLoading || !data ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-4">
          {data.provisional ? (
            <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
              <strong>Provisional.</strong>{' '}
              {data.ended
                ? 'The period has ended but is not locked yet. It locks automatically within the hour; until then counts can still change.'
                : 'Counts are still changing. This shows where everyone would land if the period ended now.'}
            </p>
          ) : (
            <p className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800">
              <strong>Final.</strong> Locked{data.period.lockedAt ? ` on ${formatDate(data.period.lockedAt)}` : ''}. These figures no longer change.
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p>
              Incentives due <span className="font-bold tabular-nums">{formatCurrency(data.totals.incentiveDue)}</span>
              <span className="mx-2 text-muted-foreground">·</span>
              Deductions <span className="font-bold tabular-nums">{data.totals.deductions}</span>
            </p>
          </div>

          <div className="max-h-[50vh] overflow-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Staff</th>
                  <th className="px-3 py-2 text-right">Count</th>
                  <th className="px-3 py-2 text-left">Zone</th>
                  <th className="px-3 py-2 text-left">Payroll</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.rows.map((r) => (
                  <tr key={r.userId}>
                    <td className="px-3 py-2 font-medium">{r.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.count} <span className="text-xs text-muted-foreground">/ {r.minimum}–{r.threshold}</span>
                    </td>
                    <td className="px-3 py-2">
                      <ZoneChip zone={r.zone} />
                    </td>
                    <td className="px-3 py-2">{verdict(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button className="flex-1" variant="outline" isLoading={download.isPending} onClick={() => download.mutate()}>
              <Download className="mr-1.5 h-4 w-4" /> Export CSV for payroll
            </Button>
            {canLock && data.provisional && data.ended && (
              <Button className="flex-1" onClick={() => setConfirmLock(true)}>
                <Lock className="mr-1.5 h-4 w-4" /> Lock now
              </Button>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmLock}
        onClose={() => setConfirmLock(false)}
        onConfirm={() => lock.mutate()}
        isLoading={lock.isPending}
        title="Lock this period?"
        description="The outcome is frozen for payroll and credits can no longer be revoked. This can't be undone."
        confirmText="Lock period"
      />
    </Modal>
  )
}
