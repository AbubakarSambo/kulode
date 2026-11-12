import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Modal } from '@/components/shared/Modal'
import { Button, Input } from '@/components/ui'
import { collectionApi } from '@/api'
import type { PhoneCredit } from '@/api'
import { formatDateTime } from '@/lib/utils'

const SOURCE_LABEL: Record<PhoneCredit['source'], string> = {
  ORDER: 'Order',
  PAY: 'Pay screen',
  QUICK_ADD: 'Quick add',
  CUSTOMER_FORM: 'Customer form',
}

/** Managers review who captured which numbers and revoke credits that don't hold up. */
export function PhoneCreditsModal({ isOpen, onClose, periodId }: { isOpen: boolean; onClose: () => void; periodId?: string }) {
  const queryClient = useQueryClient()
  const [revoking, setRevoking] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  const { data: credits, isLoading } = useQuery({
    queryKey: ['collection-credits', periodId],
    queryFn: () => collectionApi.credits({ periodId }),
    enabled: isOpen,
  })

  const revoke = useMutation({
    mutationFn: ({ id, why }: { id: string; why: string }) => collectionApi.revokeCredit(id, why),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection-credits'] })
      queryClient.invalidateQueries({ queryKey: ['collection-board'] })
      toast.success('Credit revoked')
      setRevoking(null)
      setReason('')
    },
    onError: (error: any) => toast.error(error.response?.data?.message || 'Failed to revoke credit'), // eslint-disable-line @typescript-eslint/no-explicit-any
  })

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Captured numbers" description="Newest first. Revoke a credit that doesn't hold up — it stops counting but stays on record.">
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !credits || credits.length === 0 ? (
        <p className="text-sm text-muted-foreground">No numbers captured in this period yet.</p>
      ) : (
        <ul className="max-h-[60vh] divide-y divide-border overflow-auto">
          {credits.map((c) => (
            <li key={c.id} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={`truncate text-sm font-semibold ${c.revokedAt ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                    {c.customerName} · {c.phone}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {c.staffName} · {SOURCE_LABEL[c.source]} · {formatDateTime(c.capturedAt)}
                  </p>
                  {c.revokedAt && <p className="text-xs text-red-600">Revoked: {c.revokeReason}</p>}
                </div>
                {!c.revokedAt && revoking !== c.id && (
                  <Button variant="outline" size="sm" onClick={() => setRevoking(c.id)}>
                    Revoke
                  </Button>
                )}
              </div>
              {revoking === c.id && (
                <form
                  className="mt-2 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (reason.trim()) revoke.mutate({ id: c.id, why: reason.trim() })
                  }}
                >
                  <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" autoFocus />
                  <Button type="submit" size="sm" disabled={!reason.trim()} isLoading={revoke.isPending}>
                    Confirm
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setRevoking(null)}>
                    Cancel
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
