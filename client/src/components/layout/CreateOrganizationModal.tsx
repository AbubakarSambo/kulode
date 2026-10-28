import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, Input, Label } from '@/components/ui'
import { Modal } from '@/components/shared/Modal'
import { useCreateOrganization } from '@/hooks'
import { cn } from '@/lib/utils'

const createOrgSchema = z.object({
  organizationName: z.string().trim().min(2, 'Enter the business name').max(255),
})
type CreateOrgFormData = z.infer<typeof createOrgSchema>

const POS_MODES = [
  { value: 'RESTAURANT', label: 'Restaurant / bar' },
  { value: 'RETAIL', label: 'Retail store' },
] as const

// A second business under the same login. It starts on its own 30-day Pro trial, like a sign-up.
export function CreateOrganizationModal({ onClose }: { onClose: () => void }) {
  const form = useForm<CreateOrgFormData>({ resolver: zodResolver(createOrgSchema) })
  const [posMode, setPosMode] = useState<'RESTAURANT' | 'RETAIL'>('RESTAURANT')
  const createOrg = useCreateOrganization()

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="New organization"
      description="Add another business under your login. You'll be its Super Admin and can switch between your businesses from the menu under your name. It starts with its own 30-day free trial."
    >
      <form
        onSubmit={form.handleSubmit((data) =>
          createOrg.mutate({ organizationName: data.organizationName, posMode }, { onSuccess: onClose }),
        )}
        className="space-y-4"
      >
        <div className="space-y-2">
          <Label htmlFor="new-org-name" required>Business name</Label>
          <Input
            id="new-org-name"
            placeholder="e.g. NOON Daytime Bar"
            autoComplete="organization"
            {...form.register('organizationName')}
            error={form.formState.errors.organizationName?.message}
          />
        </div>
        <div className="space-y-2">
          <Label>Type of business</Label>
          <div className="flex flex-wrap gap-2">
            {POS_MODES.map((mode) => (
              <button
                key={mode.value}
                type="button"
                onClick={() => setPosMode(mode.value)}
                className={cn(
                  'cursor-pointer rounded-full px-4 py-2 text-sm font-medium',
                  posMode === mode.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
                )}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <Button type="submit" isLoading={createOrg.isPending}>
            Create
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  )
}
