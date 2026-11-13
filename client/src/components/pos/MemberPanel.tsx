import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Gift } from 'lucide-react'
import { Button, Input, Label } from '@/components/ui'
import { Modal } from '@/components/shared/Modal'
import { loyaltyApi, ordersApi } from '@/api'
import type { MemberReward } from '@/api'
import { useLoyaltyOn } from '@/hooks/useLoyaltyOn'
import { formatCurrency, formatDate } from '@/lib/utils'

interface Props {
  customerId: string
  /** The order rewards would go on. Without one (or when it is no longer open) the panel only shows. */
  orderId?: string
  canRedeem?: boolean
  /** The part of the order's discount that is a member discount (0 = none applied) */
  memberDiscountAmount?: number
  /** Called after a reward has been put on the order, so the screen can reload its items. */
  onRedeemed?: () => void
  /** Called after the member discount was applied or removed, so the screen can reload the order totals. */
  onDiscountChanged?: () => void
}

const apiMessage = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback

/**
 * A loyalty member at the till: lifetime spend, progress to the next reward, and the rewards they
 * can use now. Tapping a reward lets the customer pick one of its items, which goes on the order at ₦0.
 */
export function MemberPanel({ customerId, orderId, canRedeem = false, memberDiscountAmount = 0, onRedeemed, onDiscountChanged }: Props) {
  const loyaltyOn = useLoyaltyOn()
  const queryClient = useQueryClient()
  const [using, setUsing] = useState<MemberReward | null>(null)
  const [pinOpen, setPinOpen] = useState(false)
  const [pin, setPin] = useState('')

  const settings = useQuery({ queryKey: ['loyalty-settings'], queryFn: loyaltyApi.settings, enabled: loyaltyOn, staleTime: 5 * 60_000 })
  const hasDiscounts = settings.data?.discounts.some((d) => d.isActive) ?? false

  const summary = useQuery({
    queryKey: ['loyalty-member', customerId],
    queryFn: () => loyaltyApi.member(customerId),
    enabled: loyaltyOn,
  })

  const redeem = useMutation({
    mutationFn: ({ rewardId, menuItemId }: { rewardId: string; menuItemId: string }) => ordersApi.redeemReward(orderId as string, { rewardId, menuItemId }),
    onSuccess: () => {
      toast.success('Reward added to the order at ₦0')
      setUsing(null)
      queryClient.invalidateQueries({ queryKey: ['loyalty-member', customerId] })
      onRedeemed?.()
    },
    onError: (error) => {
      toast.error(apiMessage(error, 'Could not use that reward'))
      // It may have been used on another device: reload what is really available.
      queryClient.invalidateQueries({ queryKey: ['loyalty-member', customerId] })
      setUsing(null)
    },
  })

  const applyDiscount = useMutation({
    mutationFn: (approverPin?: string) => ordersApi.applyMemberDiscount(orderId as string, approverPin),
    onSuccess: () => {
      toast.success('Member discount applied')
      setPinOpen(false)
      setPin('')
      onDiscountChanged?.()
    },
    onError: (error) => {
      const code = (error as { response?: { data?: { code?: string } } })?.response?.data?.code
      // Stacking on another discount needs a supervisor: ask for their PIN rather than failing.
      if (code === 'APPROVAL_REQUIRED') {
        setPinOpen(true)
        return
      }
      toast.error(apiMessage(error, 'Could not apply the member discount'))
    },
  })

  const removeDiscount = useMutation({
    mutationFn: () => ordersApi.removeMemberDiscount(orderId as string),
    onSuccess: () => {
      toast.success('Member discount removed')
      onDiscountChanged?.()
    },
    onError: (error) => toast.error(apiMessage(error, 'Could not remove the member discount')),
  })

  if (!loyaltyOn || !summary.data?.customer.isMember) return null
  const { customer, rewards, progress } = summary.data
  const nearest = progress.length ? progress.reduce((a, b) => (b.toNext < a.toNext ? b : a)) : null

  return (
    <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3" aria-label="Loyalty member">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Gift className="h-4 w-4 text-primary" /> Loyalty member
        </p>
        <p className="text-xs text-muted-foreground">Lifetime spend {formatCurrency(customer.lifetimeSpend)}</p>
      </div>
      {nearest && (
        <p className="mt-1 text-xs text-muted-foreground">
          {formatCurrency(nearest.toNext)} to the next {nearest.name}
        </p>
      )}

      {rewards.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">No rewards to use right now</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {rewards.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg bg-card p-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{r.name}</p>
                <p className="text-xs text-muted-foreground">Use before {formatDate(r.expiresAt)}</p>
              </div>
              {canRedeem && orderId ? (
                <Button type="button" size="sm" onClick={() => setUsing(r)}>
                  Use
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canRedeem && orderId && (hasDiscounts || memberDiscountAmount > 0) && (
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-primary/20 pt-3">
          <p className="text-xs text-muted-foreground">
            {memberDiscountAmount > 0 ? `Member discount applied: −${formatCurrency(memberDiscountAmount)}` : 'Member discounts apply to selected items'}
          </p>
          {memberDiscountAmount > 0 ? (
            <Button type="button" size="sm" variant="outline" isLoading={removeDiscount.isPending} onClick={() => removeDiscount.mutate()}>
              Remove
            </Button>
          ) : (
            <Button type="button" size="sm" variant="outline" isLoading={applyDiscount.isPending} onClick={() => applyDiscount.mutate(undefined)}>
              Apply member discount
            </Button>
          )}
        </div>
      )}
      {!canRedeem && rewards.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Rewards can be used once the order has been placed.</p>}

      <Modal isOpen={pinOpen} onClose={() => setPinOpen(false)} title="Supervisor approval" description="This order already has a discount">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Adding the member discount on top of another discount needs a supervisor's PIN.</p>
          <div>
            <Label>Supervisor PIN</Label>
            <Input type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value)} aria-label="Supervisor PIN" />
          </div>
          <Button className="w-full" disabled={pin.length !== 4} isLoading={applyDiscount.isPending} onClick={() => applyDiscount.mutate(pin)}>
            Approve and apply
          </Button>
        </div>
      </Modal>

      <Modal isOpen={using !== null} onClose={() => setUsing(null)} title={using ? `Use ${using.name}` : 'Use reward'} description="The customer chooses one">
        <div className="space-y-2">
          {using?.items.length === 0 && <p className="text-sm text-muted-foreground">None of this reward's items are available right now.</p>}
          {using?.items.map((item) => (
            <Button
              key={item.id}
              type="button"
              variant="outline"
              className="w-full justify-start"
              isLoading={redeem.isPending && redeem.variables?.menuItemId === item.id}
              disabled={redeem.isPending}
              onClick={() => redeem.mutate({ rewardId: using.id, menuItemId: item.id })}
            >
              {item.name}
            </Button>
          ))}
        </div>
      </Modal>
    </div>
  )
}
