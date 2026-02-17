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
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left text-sm font-medium">Name</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Email</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Role</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
                    <th className="px-4 py-3 text-right text-sm font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.data.map((user) => (
                    <tr key={user.id} className="border-b last:border-0">
                      <td className="px-4 py-3">
                        <p className="font-medium">{user.firstName} {user.lastName}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary">{roleLabels[user.role]}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        {!user.isActive ? (
                          <Badge variant="secondary">Inactive</Badge>
                        ) : !user.isEmailVerified ? (
                          <Badge variant="outline">Pending Invite</Badge>
                        ) : (
                          <Badge variant="success">Active</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right space-x-1">
                        {user.isActive && !user.isEmailVerified && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => resendInviteMutation.mutate(user.id)}
                            disabled={resendInviteMutation.isPending}
                            title="Resend invite"
                          >
                            <Send className="h-4 w-4" />
                          </Button>
                        )}
                        {user.isActive && user.role !== 'SUPER_ADMIN' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeactivate(user)}
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
