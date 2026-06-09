import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Plus, UserX, Send } from 'lucide-react'
import { Header } from '@/components/layout'
import { Button, Input, Label, Select, Card, CardContent, Badge } from '@/components/ui'
import { Modal } from '@/components/shared/Modal'
import apiClient from '@/api/client'
import { posthog } from '@/lib/posthog'
import { cn } from '@/lib/utils'
import type { ApiResponse, PaginatedResponse, UserRole } from '@/types'

interface UserData {
  id: string
  email: string
  firstName: string
  lastName: string
  role: UserRole
  isActive: boolean
  isEmailVerified: boolean
  createdAt: string
}

const usersApi = {
  list: async (): Promise<PaginatedResponse<UserData>> => {
    const response = await apiClient.get<ApiResponse<PaginatedResponse<UserData>>>('/users')
    return response.data.data
  },
  create: async (data: CreateUserData): Promise<UserData> => {
    const response = await apiClient.post<ApiResponse<UserData>>('/users', data)
    return response.data.data
  },
  update: async (id: string, data: Partial<CreateUserData>): Promise<UserData> => {
    const response = await apiClient.patch<ApiResponse<UserData>>(`/users/${id}`, data)
    return response.data.data
  },
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/users/${id}`)
  },
  resendInvite: async (id: string): Promise<{ message: string }> => {
    const response = await apiClient.post<ApiResponse<{ message: string }>>(`/users/${id}/resend-invite`)
    return response.data.data
  },
}

interface CreateUserData {
  email: string
  firstName: string
  lastName: string
  role: UserRole
}

const userSchema = z.object({
  email: z.string().email('Invalid email'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  role: z.enum(['ADMIN', 'ACCOUNTANT', 'STAFF']),
})

type UserFormData = z.infer<typeof userSchema>

const roleLabels: Record<UserRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  ACCOUNTANT: 'Accountant',
  STAFF: 'Staff',
}

export function UsersPage() {
  const queryClient = useQueryClient()
  const [isModalOpen, setIsModalOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list(),
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UserFormData>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      email: '',
      firstName: '',
      lastName: '',
      role: 'STAFF',
    },
  })

  const createMutation = useMutation({
    mutationFn: (data: UserFormData) => usersApi.create(data as CreateUserData),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      posthog.capture('team_member_invited', { role: variables.role })
      toast.success('Invitation sent', {
        description: `Invitation sent to ${variables.email}`,
      })
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

  const onSubmit = (data: UserFormData) => {
    createMutation.mutate(data)
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

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : (
          <Card className="border-0 bg-white shadow-[0px_12px_32px_rgba(0,55,176,0.03)] rounded-[24px] overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-auto max-h-[60vh]">
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
                      <td className="px-6 py-4 text-xs font-semibold text-slate-500">{user.email}</td>
                      <td className="px-6 py-4">
                        <Badge variant="secondary" className="rounded-md">{roleLabels[user.role]}</Badge>
                      </td>
                      <td className="px-6 py-4">
                        {!user.isActive ? (
                          <Badge variant="secondary" className="rounded-md">Inactive</Badge>
                        ) : !user.isEmailVerified ? (
                          <Badge variant="outline" className="rounded-md">Pending Invite</Badge>
                        ) : (
                          <Badge variant="success" className="rounded-md">Active</Badge>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right space-x-1">
                        {user.isActive && !user.isEmailVerified && (
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
                        {user.isActive && user.role !== 'SUPER_ADMIN' && (
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
            <Label htmlFor="email" required>Email</Label>
            <Input
              id="email"
              type="email"
              {...register('email')}
              error={errors.email?.message}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role" required>Role</Label>
            <Select
              id="role"
              {...register('role')}
              error={errors.role?.message}
            >
              <option value="ADMIN">Admin</option>
              <option value="ACCOUNTANT">Accountant</option>
              <option value="STAFF">Staff</option>
            </Select>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" isLoading={createMutation.isPending}>
              Send Invitation
            </Button>
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
