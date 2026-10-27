import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button, Input, Label } from '@/components/ui'
import { Modal } from '@/components/shared/Modal'
import { usersApi } from '@/api/users'

const myPinSchema = z.object({
  pin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits'),
  password: z.string().min(1, 'Enter your password'),
})
type MyPinFormData = z.infer<typeof myPinSchema>

// Admins and managers set their own approval PIN here. The Users page can't do it for them: one
// Admin can't manage another Admin's account, and nobody manages their own row there.
export function MyPinModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const form = useForm<MyPinFormData>({ resolver: zodResolver(myPinSchema) })

  const close = () => {
    form.reset()
    onClose()
  }

  const setPin = useMutation({
    mutationFn: (data: MyPinFormData) => usersApi.setOwnPin(data.pin, data.password),
    onSuccess: () => {
      toast.success('PIN saved')
      close()
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error('Failed to set PIN', { description: message })
    },
  })

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title="My PIN"
      description="A 4-digit PIN you type on a cashier's screen to approve a void or discount. It can't be used to sign in. Setting a new one replaces your old PIN."
    >
      <form onSubmit={form.handleSubmit((data) => setPin.mutate(data))} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="my-pin" required>New PIN</Label>
          <Input
            id="my-pin"
            inputMode="numeric"
            maxLength={4}
            placeholder="4821"
            autoComplete="off"
            {...form.register('pin')}
            error={form.formState.errors.pin?.message}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="my-pin-password" required>Your password</Label>
          <Input
            id="my-pin-password"
            type="password"
            autoComplete="current-password"
            {...form.register('password')}
            error={form.formState.errors.password?.message}
          />
        </div>
        <div className="flex gap-3 pt-2">
          <Button type="submit" isLoading={setPin.isPending}>
            Save PIN
          </Button>
          <Button type="button" variant="outline" onClick={close}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  )
}
