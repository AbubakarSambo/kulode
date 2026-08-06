import apiClient from './client'
import type { ApiResponse, Waiter } from '@/types'

export interface CreateWaiterData {
  name: string
  phone?: string
  notes?: string
}

export interface UpdateWaiterData {
  name?: string
  phone?: string
  notes?: string
  isActive?: boolean
}

export const waitersApi = {
  list: async (): Promise<Waiter[]> => {
    const response = await apiClient.get<ApiResponse<Waiter[]>>('/waiters')
    return response.data.data
  },
  create: async (data: CreateWaiterData): Promise<Waiter> => {
    const response = await apiClient.post<ApiResponse<Waiter>>('/waiters', data)
    return response.data.data
  },
  update: async (id: string, data: UpdateWaiterData): Promise<Waiter> => {
    const response = await apiClient.patch<ApiResponse<Waiter>>(`/waiters/${id}`, data)
    return response.data.data
  },
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/waiters/${id}`)
  },
}
