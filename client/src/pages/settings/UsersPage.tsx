import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Plus, UserX, Send, KeyRound } from 'lucide-react'
import { Header } from '@/components/layout'
import { Button, Input, Label, Card, CardContent, Badge } from '@/components/ui'
import { Modal } from '@/components/shared/Modal'
import { usersApi } from '@/api/users'
import type { UserData, CreateUserData } from '@/api/users'
import { posthog } from '@/lib/posthog'
import { cn } from '@/lib/utils'
import { useOrgModules } from '@/hooks/useOrgModules'
import { useAuthStore } from '@/stores/auth'
import type { UserRole } from '@/types'
import { PIN_ELIGIBLE_ROLES } from '@/lib/pin'

const userSchema = z
  .object({
    email: z.string().email('Invalid email').optional().or(z.literal('')),
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    roles: z.array(z.string()).min(1, 'At least one role is required'),
  })
  .superRefine((data, ctx) => {
    const allPinEligible = data.roles.every((r) => PIN_ELIGIBLE_ROLES.includes(r as UserRole))
    if (!data.email && !allPinEligible) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['email'], message: 'Email is required for this role' })
    }
  })

type UserFormData = z.infer<typeof userSchema>

const roleLabels: Record<UserRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  ACCOUNTANT: 'Accountant',
  STAFF: 'Staff',
  MANAGER: 'Manager',
  SUPERVISOR: 'Supervisor',
  CASHIER: 'Cashier',
  WAITER: 'Waiter',
  PASS: 'Pass',
  RUNNER: 'Runner',
}

// Creatable roles by org type — SUPER_ADMIN is never assignable through this UI.
const POS_CREATABLE_ROLES: { value: UserRole; label: string }[] = [
  { value: 'WAITER', label: 'Waiter' },
  { value: 'PASS', label: 'Pass' },
  { value: 'RUNNER', label: 'Runner' },
  { value: 'CASHIER', label: 'Cashier' },
  { value: 'SUPERVISOR', label: 'Supervisor' },
  { value: 'MANAGER', label: 'Manager' },
  { value: 'ADMIN', label: 'Admin' },
]
const DEFAULT_CREATABLE_ROLES: { value: UserRole; label: string }[] = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'ACCOUNTANT', label: 'Accountant' },
  { value: 'STAFF', label: 'Staff' },
]

const pinSchema = z.object({
  pin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits'),
})
type PinFormData = z.infer<typeof pinSchema>

export function UsersPage() {
  const queryClient = useQueryClient()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [pinModalUser, setPinModalUser] = useState<UserData | null>(null)
  // Any org running POS (POS-only or BOTH) uses the waiter/cashier ladder — only a pure
  // invoicing-only org keeps STAFF/ACCOUNTANT. Matches usesPosRoles() on the backend.
  const { hasPos } = useOrgModules()
  const currentUser = useAuthStore((s) => s.user)
  const usesPosRoles = hasPos
  const roleOptions = (usesPosRoles ? POS_CREATABLE_ROLES : DEFAULT_CREATABLE_ROLES).filter(
    (opt) => opt.value !== 'ADMIN' || !!currentUser?.roles.includes('SUPER_ADMIN'),
  )

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list(),
  })

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<UserFormData>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      email: '',
      firstName: '',
      lastName: '',
      roles: [usesPosRoles ? 'WAITER' : 'STAFF'],
    },
  })
  const selectedRoles = (watch('roles') ?? []) as UserRole[]
  const showEmailField = selectedRoles.length === 0 || !selectedRoles.every((r) => PIN_ELIGIBLE_ROLES.includes(r))

  const toggleRole = (role: UserRole) => {
    const current = selectedRoles
    setValue(
      'roles',
      current.includes(role) ? current.filter((r) => r !== role) : [...current, role],
      { shouldValidate: true },
    )
  }

  const createMutation = useMutation({
    mutationFn: (data: UserFormData) => usersApi.create(data as CreateUserData),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      posthog.capture('team_member_invited', { roles: variables.roles })
      if (variables.email) {
        toast.success('Invitation sent', {
          description: `Invitation sent to ${variables.email}`,
        })
      } else {
        toast.success('User created', {
          description: 'Set a PIN for them below so they can log in on a shared terminal',
        })
      }
      setIsModalOpen(false)
      reset()
    },
    onError: (error: any) => {
      toast.error('Failed to invite user', {
        description: error.response?.data?.message,
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => usersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      posthog.capture('team_member_deactivated')
      toast.success('User deactivated')
    },
    onError: (error: any) => {
      toast.error('Failed to deactivate user', {
        description: error.response?.data?.message,
      })
    },
  })

  const resendInviteMutation = useMutation({
    mutationFn: (id: string) => usersApi.resendInvite(id),
    onSuccess: (data) => {
      toast.success('Invite resent', {
        description: data.message,
      })
    },
    onError: (error: any) => {
      toast.error('Failed to resend invite', {
        description: error.response?.data?.message,
      })
    },
  })

  const pinForm = useForm<PinFormData>({ resolver: zodResolver(pinSchema) })

  const setPinMutation = useMutation({
    mutationFn: ({ id, pin }: { id: string; pin: string }) => usersApi.setPin(id, pin),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('PIN set')
      setPinModalUser(null)
      pinForm.reset()
    },
    onError: (error: any) => {
      toast.error('Failed to set PIN', {
        description: error.response?.data?.message,
      })
    },
  })

  const clearPinMutation = useMutation({
    mutationFn: (id: string) => usersApi.clearPin(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('PIN removed')
    },
    onError: (error: any) => {
      toast.error('Failed to remove PIN', {
        description: error.response?.data?.message,
      })
    },
  })

  const onSubmit = (data: UserFormData) => {
    createMutation.mutate({ ...data, email: data.email || undefined })
  }

  const handleClearPin = (user: UserData) => {
    if (window.confirm(`Remove ${user.firstName}'s PIN? They'll need a new one set to use quick login.`)) {
      clearPinMutation.mutate(user.id)
    }
  }

  const handleDeactivate = (user: UserData) => {
    if (window.confirm(`Deactivate ${user.firstName} ${user.lastName}?`)) {
      deleteMutation.mutate(user.id)
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="User Management"
        description="Manage team members and their roles"
        action={
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Invite User
          </Button>
        }
      />

      <div className="flex-1 overflow-auto px-4 pb-4 pt-0 sm:px-6 sm:pb-6 sm:pt-0">
        <div className="pt-4 sm:pt-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : (
          <Card className="border-0 bg-white shadow-[0px_12px_32px_rgba(0,55,176,0.08)] rounded-[24px] overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] border-collapse">
                <thead>
                  <tr className="bg-white text-slate-600">
                    <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 select-none">Name</th>
                    <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 select-none">Email</th>
                    <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 select-none">Role</th>
                    <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 select-none">Status</th>
                    <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400 select-none">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y-0">
                  {data?.data.map((user, index) => (
                    <tr 
                      key={user.id} 
                      className={cn(
                        "transition-all duration-150 hover:bg-[#eef4ff]/20",
                        index % 2 === 0 ? "bg-transparent" : "bg-[#eef4ff]/08"
                      )}
                    >
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-900 text-sm">{user.firstName} {user.lastName}</p>
                      </td>
                      <td className="px-6 py-4 text-xs font-semibold text-slate-500">
                        {user.hasPlaceholderEmail ? (
                          <span className="italic text-slate-400">PIN login only</span>
                        ) : (
                          user.email
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {user.roles.map((r) => (
                            <Badge key={r} variant="secondary" className="rounded-md">{roleLabels[r]}</Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {!user.isActive ? (
                          <Badge variant="secondary" className="rounded-md">Inactive</Badge>
                        ) : user.hasPlaceholderEmail ? (
                          user.pinSetAt ? (
                            <Badge variant="success" className="rounded-md">Active</Badge>
                          ) : (
                            <Badge variant="outline" className="rounded-md">PIN not set</Badge>
                          )
                        ) : !user.isEmailVerified ? (
                          <Badge variant="outline" className="rounded-md">Pending Invite</Badge>
                        ) : (
                          <Badge variant="success" className="rounded-md">Active</Badge>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right space-x-1">
                        {user.isActive && !user.isEmailVerified && !user.hasPlaceholderEmail && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => resendInviteMutation.mutate(user.id)}
                            disabled={resendInviteMutation.isPending}
                            title="Resend invite"
                            className="h-8 w-8 p-0 rounded-lg"
                          >
                            <Send className="h-4 w-4" />
                          </Button>
                        )}
                        {user.isActive && user.roles.every((r) => PIN_ELIGIBLE_ROLES.includes(r)) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              user.pinSetAt ? handleClearPin(user) : setPinModalUser(user)
                            }
                            title={user.pinSetAt ? 'Remove PIN' : 'Set quick-login PIN'}
                            className={cn(
                              'h-8 w-8 p-0 rounded-lg',
                              user.pinSetAt && 'text-rose-500 hover:text-rose-700 hover:bg-rose-50',
                            )}
                          >
                            <KeyRound className="h-4 w-4" />
                          </Button>
                        )}
                        {user.isActive && !user.roles.includes('SUPER_ADMIN') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeactivate(user)}
                            className="h-8 w-8 p-0 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                          >
                            <UserX className="h-4 w-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </CardContent>
          </Card>
        )}
        </div>
      </div>

      {/* Invite User Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Invite User"
        description="Send an invitation to a new team member"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName" required>First Name</Label>
              <Input
                id="firstName"
                {...register('firstName')}
                error={errors.firstName?.message}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName" required>Last Name</Label>
              <Input
                id="lastName"
                {...register('lastName')}
                error={errors.lastName?.message}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label required>Roles</Label>
            <p className="text-xs text-muted-foreground">
              Select one or more — a user can hold multiple roles at once (e.g. Cashier + Waiter),
              with access being the union of whatever each grants.
            </p>
            <div className="flex flex-wrap gap-2">
              {roleOptions.map((opt) => {
                const selected = selectedRoles.includes(opt.value)
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleRole(opt.value)}
                    className={cn(
                      'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                      selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
            {errors.roles && <p className="text-xs text-destructive">{errors.roles.message}</p>}
          </div>

          {showEmailField ? (
            <div className="space-y-2">
              <Label htmlFor="email" required>Email</Label>
              <Input
                id="email"
                type="email"
                {...register('email')}
                error={errors.email?.message}
              />
            </div>
          ) : (
            <p className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">
              This role logs in with a PIN, not email — you'll set one for them right after creating the account.
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="submit" isLoading={createMutation.isPending}>
              {showEmailField ? 'Send Invitation' : 'Create Account'}
            </Button>
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={!!pinModalUser}
        onClose={() => {
          setPinModalUser(null)
          pinForm.reset()
        }}
        title="Set Quick-Login PIN"
        description={pinModalUser ? `4-digit PIN ${pinModalUser.firstName} will use to log into a shared POS terminal` : undefined}
      >
        <form
          onSubmit={pinForm.handleSubmit((data) =>
            pinModalUser && setPinMutation.mutate({ id: pinModalUser.id, pin: data.pin }),
          )}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="pin" required>PIN</Label>
            <Input
              id="pin"
              inputMode="numeric"
              maxLength={4}
              placeholder="4821"
              {...pinForm.register('pin')}
              error={pinForm.formState.errors.pin?.message}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="submit" isLoading={setPinMutation.isPending}>
              Save PIN
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPinModalUser(null)
                pinForm.reset()
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
