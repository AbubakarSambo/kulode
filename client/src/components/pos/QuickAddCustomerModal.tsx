import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Modal } from '@/components/shared/Modal'
import { Button, Input, Label, Select } from '@/components/ui'
import { collectionApi, usersApi } from '@/api'
import type { DirectoryEntry } from '@/api'
import { customerSaveError } from '@/lib/phoneErrors'

const COLLECTORS = ['WAITER', 'CASHIER', 'SUPERVISOR', 'MANAGER'] as const

// Stays open after each save so a stack of forms can be entered back to back.
function QuickAddForm({ staff }: { staff: DirectoryEntry[] | undefined }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [collectedById, setCollectedById] = useState('')
  // One key per entry: a double-tap or a retry after a bad connection can't save it twice.
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())

  const save = useMutation({
    mutationFn: () => collectionApi.quickAdd({ name: name.trim(), phone: phone.trim(), email: email.trim() || undefined, collectedById, clientRequestId: requestId }),
    onSuccess: (customer) => {
      queryClient.invalidateQueries({ queryKey: ['collection-board'] })
      queryClient.invalidateQueries({ queryKey: ['collection-credits'] })
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      const collector = staff?.find((s) => s.id === collectedById)
      toast.success(`${customer.name} saved${collector ? ` — credit to ${collector.firstName}` : ''}`)
      setName('')
      setPhone('')
      setEmail('')
      setRequestId(crypto.randomUUID())
    },
    onError: (err: unknown) => {
      const { message, code, existingCustomerId } = customerSaveError(err, 'Failed to save customer')
      if (code === 'PHONE_EXISTS' && existingCustomerId) {
        toast.error('Customer already exists', {
          description: 'That number is already saved — no credit is given for it.',
          action: { label: 'Open customer', onClick: () => navigate(`/pos/customers/${existingCustomerId}`) },
        })
      } else {
        toast.error(message)
      }
      // A rejected entry didn't save, so it may be corrected and retried under a fresh key.
      setRequestId(crypto.randomUUID())
    },
  })

  const canSave = name.trim().length > 0 && phone.trim().length > 0 && !!collectedById

  return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (canSave) save.mutate()
        }}
      >
        <div>
          <Label>Collected by</Label>
          <Select value={collectedById} onChange={(e) => setCollectedById(e.target.value)}>
            <option value="">Select staff member…</option>
            {staff?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.firstName} {s.lastName}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tunde Bakare" autoFocus />
        </div>
        <div>
          <Label>Phone</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0803 123 4567" inputMode="tel" />
        </div>
        <div>
          <Label>Email (optional)</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tunde@example.com" />
        </div>
        <Button type="submit" className="w-full" disabled={!canSave} isLoading={save.isPending}>
          Save and add another
        </Button>
      </form>
  )
}

/**
 * For numbers taken on paper or from QR feedback forms: a supervisor keys them in on behalf of the
 * staff member who collected them, and that person gets the credit. The form only mounts while the
 * modal is open, so closing it clears the entry.
 */
export function QuickAddCustomerModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { data: staff } = useQuery({
    queryKey: ['staff-directory', 'collectors'],
    queryFn: () => usersApi.directory([...COLLECTORS]),
    enabled: isOpen,
  })
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Quick add customer" description="Numbers from paper or QR feedback forms">
      <QuickAddForm staff={staff} />
    </Modal>
  )
}
