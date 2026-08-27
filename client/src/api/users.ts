import apiClient from './client'
import type { ApiResponse, PaginatedResponse, UserRole } from '@/types'

export interface UserData {
  id: string
  email: string
  firstName: string
  lastName: string
  roles: UserRole[]
  businessRole?: string | null
  phone?: string | null
  notes?: string | null
  isActive: boolean
  isEmailVerified: boolean
  hasPlaceholderEmail?: boolean
  pinSetAt?: string | null
  createdAt: string
  updatedAt?: string
}

export interface CreateUserData {
  email?: string
  firstName: string
  lastName: string
  roles?: UserRole[]
  phone?: string
  notes?: string
}

export interface DirectoryEntry {
  id: string
  firstName: string
  lastName: string
  phone?: string | null
}

export interface StaffOrderSummary {
  id: string
  status: string
  total: number
  source: string
  createdAt: string
  closedAt?: string
}

export interface StaffOrderHistory {
  id: string
  firstName: string
  lastName: string
  phone?: string | null
  notes?: string | null
  isActive: boolean
  orders: StaffOrderSummary[]
  stats: { totalOrders: number; totalRevenue: number }
}

export const usersApi = {
  list: async (): Promise<PaginatedResponse<UserData>> => {
    const response = await apiClient.get<ApiResponse<PaginatedResponse<UserData>>>('/users')
    return response.data.data
  },
  // Lightweight, broadly-accessible staff picker for one or more roles (e.g. assigning a waiter
  // to an order) — unlike list() above, any authenticated staff member can call this.
  directory: async (role: UserRole | UserRole[]): Promise<DirectoryEntry[]> => {
    const roleParam = Array.isArray(role) ? role.join(',') : role
    const response = await apiClient.get<ApiResponse<DirectoryEntry[]>>('/users/directory', {
      params: { role: roleParam },
    })
    return response.data.data
  },
  getOrderHistory: async (id: string): Promise<StaffOrderHistory> => {
    const response = await apiClient.get<ApiResponse<StaffOrderHistory>>(`/users/${id}/waiter-history`)
    return response.data.data
  },
  create: async (data: CreateUserData): Promise<UserData> => {
    const response = await apiClient.post<ApiResponse<UserData>>('/users', data)
    return response.data.data
  },
  update: async (id: string, data: Partial<CreateUserData> & { isActive?: boolean }): Promise<UserData> => {
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
  setPin: async (id: string, pin: string): Promise<{ message: string }> => {
    const response = await apiClient.post<ApiResponse<{ message: string }>>(`/users/${id}/pin`, { pin })
    return response.data.data
  },
  clearPin: async (id: string): Promise<{ message: string }> => {
    const response = await apiClient.delete<ApiResponse<{ message: string }>>(`/users/${id}/pin`)
    return response.data.data
  },
}
