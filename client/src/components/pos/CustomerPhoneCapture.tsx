import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button, Input, Label } from '@/components/ui'
import { customersApi } from '@/api'
import type { CapturedCustomer } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { can } from '@/lib/permissions'
import { customerSaveError } from '@/lib/phoneErrors'

interface Props {
  /** The customer already on the order, if any. Nothing is shown when they already have a number. */
  customer: { id: string; name: string; phone?: string | null } | null
  source: 'ORDER' | 'PAY'
  orderId?: string
  /** The customer to put on the order: an existing one found by number, or the one just saved. */
  onResolved: (customer: CapturedCustomer) => void
}

// Nigerian numbers run 10–11 digits; wait for enough digits that a lookup is worth making.
const MIN_DIGITS = 7
const digitsOf = (value: string) => value.replace(/\D/g, '')

/**
 * "Customer phone" at the till: type a number and it finds the customer who already has it, or
 * saves it — onto the customer already on the order if they had none, otherwise as a new customer
 * (name optional). A newly saved number credits the staff member for the collection drive.
 */
export function CustomerPhoneCapture({ customer, source, orderId, onResolved }: Props) {
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
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
    mutationFn: () =>
      customersApi.capturePhone({
        phone: phone.trim(),
        name: name.trim() || undefined,
        customerId: customer?.id,
        source,
        orderId,
        clientRequestId: requestId.current,
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['collection-board'] })
      queryClient.invalidateQueries({ queryKey: ['phone-lookup'] })
      toast.success(res.credited ? 'Number saved — +1 credit to you' : 'Number saved')
      requestId.current = crypto.randomUUID()
      setPhone('')
      setName('')
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

  if (!can(user, 'PHONE_CAPTURE') || customer?.phone) return null

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
          {!customer && (
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" aria-label="Customer name" />
          )}
          <Button type="button" size="sm" className="w-full" isLoading={save.isPending} onClick={() => save.mutate()}>
            {customer ? `Save number to ${customer.name}` : 'Save and attach'}
          </Button>
        </div>
      )}
    </div>
  )
}
