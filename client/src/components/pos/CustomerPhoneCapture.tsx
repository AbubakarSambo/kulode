import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button, Input, Label } from '@/components/ui'
import { customersApi, loyaltyApi } from '@/api'
import type { CapturedCustomer, EnrolMemberData } from '@/api'

type EnrolSource = EnrolMemberData['source']
import { useAuthStore } from '@/stores/auth'
import { can } from '@/lib/permissions'
import { customerSaveError } from '@/lib/phoneErrors'
import { useLoyaltyOn } from '@/hooks/useLoyaltyOn'

interface Props {
  /** The customer already on the order, if any. Nothing is shown when they already have a number (unless they could be enrolled in loyalty). */
  customer: { id: string; name: string; phone?: string | null; isMember?: boolean } | null
  source: 'ORDER' | 'PAY'
  orderId?: string
  /** The customer to put on the order: an existing one found by number, or the one just saved. */
  onResolved: (customer: CapturedCustomer) => void
}

// Nigerian numbers run 10–11 digits; wait for enough digits that a lookup is worth making.
const MIN_DIGITS = 7
const digitsOf = (value: string) => value.replace(/\D/g, '')
// A customer saved from just a number carries that number as their name until someone adds it.
const looksLikeNumber = (name: string) => /^[+\d\s\-().]+$/.test(name.trim())

const CONSENT_LABEL = 'Customer agrees to receive loyalty messages on WhatsApp'

/** An existing customer who has a number but isn't a loyalty member yet. */
export function EnrolExisting({ customer, source, orderId, onResolved }: { customer: NonNullable<Props['customer']>; source: EnrolSource; orderId?: string; onResolved: Props['onResolved'] }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [consent, setConsent] = useState(false)
  const needsName = looksLikeNumber(customer.name)

  const enrol = useMutation({
    mutationFn: () => loyaltyApi.enrol({ customerId: customer.id, name: name.trim() || undefined, consent, source, orderId }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      toast.success(res.enrolled ? `${res.customer.name} is now a loyalty member` : `${res.customer.name} is already a member`)
      onResolved(res.customer)
    },
    onError: (err: unknown) => toast.error(customerSaveError(err, 'Failed to enrol').message),
  })

  if (!open) {
    return (
      <Button type="button" size="sm" variant="outline" className="mt-3 w-full" onClick={() => setOpen(true)}>
        Enrol {customer.name} in loyalty
      </Button>
    )
  }

  return (
    <div className="mt-3 space-y-2 rounded-xl border border-dashed border-border p-3">
      <p className="text-sm font-semibold">Enrol in loyalty</p>
      {needsName && <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer name" aria-label="Customer name" />}
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-gray-300" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        {CONSENT_LABEL}
      </label>
      <div className="flex gap-2">
        <Button type="button" size="sm" className="flex-1" disabled={!consent || (needsName && !name.trim())} isLoading={enrol.isPending} onClick={() => enrol.mutate()}>
          Enrol
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

/** Customer detail page: enrol this customer in loyalty, when the programme is on and they have a number. */
export function LoyaltyEnrolSection({ customer }: { customer: { id: string; name: string; phone?: string | null; isMember?: boolean } }) {
  const loyaltyOn = useLoyaltyOn()
  if (!loyaltyOn || customer.isMember || !customer.phone) return null
  return <EnrolExisting customer={customer} source="CUSTOMER_FORM" onResolved={() => undefined} />
}

/**
 * "Customer phone" at the till: type a number and it finds the customer who already has it, or
 * saves it — onto the customer already on the order if they had none, otherwise as a new customer
 * (name optional). A newly saved number credits the staff member for the collection drive.
 */
export function CustomerPhoneCapture(props: Props) {
  const user = useAuthStore((state) => state.user)
  const loyaltyOn = useLoyaltyOn()
  if (!can(user, 'PHONE_CAPTURE')) return null
  if (props.customer?.phone) {
    return loyaltyOn && !props.customer.isMember ? <EnrolExisting {...props} customer={props.customer} /> : null
  }
  return <PhoneCaptureForm {...props} loyaltyOn={loyaltyOn} />
}

function PhoneCaptureForm({ customer, source, orderId, onResolved, loyaltyOn }: Props & { loyaltyOn: boolean }) {
  const queryClient = useQueryClient()
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [member, setMember] = useState(false)
  const [consent, setConsent] = useState(false)
  const [debounced, setDebounced] = useState('')
  // One key per attempt: a double-tap can't save twice; a failed attempt gets a fresh one.
  const requestId = useRef(crypto.randomUUID())
  const timer = useRef<number | undefined>(undefined)

  const lookup = useQuery({
    queryKey: ['phone-lookup', debounced],
    queryFn: () => customersApi.lookupPhone(debounced),
    enabled: digitsOf(debounced).length >= MIN_DIGITS,
    staleTime: 15_000,
  })

  const save = useMutation({
    mutationFn: async (): Promise<{ customer: CapturedCustomer; credited: boolean; enrolled: boolean }> => {
      const base = { phone: phone.trim(), name: name.trim() || undefined, customerId: customer?.id, source, orderId, clientRequestId: requestId.current }
      if (member) {
        const res = await loyaltyApi.enrol({ ...base, consent })
        return { customer: res.customer, credited: res.phoneCredited, enrolled: res.enrolled }
      }
      const res = await customersApi.capturePhone(base)
      return { customer: res.customer, credited: res.credited, enrolled: false }
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['collection-board'] })
      queryClient.invalidateQueries({ queryKey: ['phone-lookup'] })
      const saved = res.credited ? 'Number saved — +1 credit to you' : 'Number saved'
      toast.success(res.enrolled ? `${saved} · loyalty member` : saved)
      requestId.current = crypto.randomUUID()
      setPhone('')
      setName('')
      setMember(false)
      setConsent(false)
      setDebounced('')
      onResolved(res.customer)
    },
    onError: (err: unknown) => {
      requestId.current = crypto.randomUUID()
      const { message, code, existingCustomerId, existingCustomerName } = customerSaveError(err, 'Failed to save number')
      if (code === 'PHONE_EXISTS' && existingCustomerId) {
        toast.error('That number belongs to another customer', {
          action: { label: `Use ${existingCustomerName ?? 'them'}`, onClick: () => onResolved({ id: existingCustomerId, name: existingCustomerName ?? 'Customer', phone: null }) },
        })
      } else {
        toast.error(message)
      }
    },
  })

  const onChange = (value: string) => {
    setPhone(value)
    // Debounce by hand so each keystroke isn't a request.
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setDebounced(value.trim()), 400)
  }

  const typedEnough = digitsOf(phone).length >= MIN_DIGITS
  const result = typedEnough && debounced === phone.trim() ? lookup.data : undefined

  return (
    <div className="mt-3 rounded-xl border border-dashed border-border p-3">
      <Label>{customer ? `${customer.name} has no phone number` : 'Customer phone'}</Label>
      <Input
        className="mt-1"
        value={phone}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0803 123 4567"
        inputMode="tel"
        aria-label="Customer phone"
      />

      {typedEnough && !result && lookup.isFetching && <p className="mt-2 text-xs text-muted-foreground">Checking…</p>}

      {result && !result.valid && <p className="mt-2 text-xs font-medium text-red-600">{result.message}</p>}

      {result?.valid && result.customer && (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-muted/60 p-2">
          <p className="min-w-0 truncate text-sm">
            <span className="font-semibold">{result.customer.name}</span> already has this number
          </p>
          <Button type="button" size="sm" onClick={() => onResolved(result.customer!)}>
            {customer ? 'Switch to them' : 'Use customer'}
          </Button>
        </div>
      )}

      {result?.valid && !result.customer && (
        <div className="mt-2 space-y-2">
          {(!customer || (member && looksLikeNumber(customer.name))) && (
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={member ? 'Name (required for loyalty)' : 'Name (optional)'} aria-label="Customer name" />
          )}
          {loyaltyOn && (
            <>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={member} onChange={(e) => setMember(e.target.checked)} />
                Loyalty member
              </label>
              {member && (
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-gray-300" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                  {CONSENT_LABEL}
                </label>
              )}
            </>
          )}
          <Button
            type="button"
            size="sm"
            className="w-full"
            disabled={member && (!consent || (!customer && !name.trim()))}
            isLoading={save.isPending}
            onClick={() => save.mutate()}
          >
            {member ? 'Save and enrol' : customer ? `Save number to ${customer.name}` : 'Save and attach'}
          </Button>
        </div>
      )}
    </div>
  )
}
