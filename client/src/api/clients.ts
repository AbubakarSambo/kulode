import apiClient from './client'
import type { Client, PaginatedResponse, ApiResponse } from '@/types'

export interface ClientFilters {
  page?: number
  limit?: number
  search?: string
  status?: 'active' | 'inactive' | ''
}

export interface CreateClientData {
  name: string
  email?: string
  phone?: string
  address?: string
  notes?: string
  clientType?: string
  whatsappOptIn?: boolean
}

export const clientsApi = {
  list: async (filters: ClientFilters = {}): Promise<PaginatedResponse<Client>> => {
    const params = new URLSearchParams()
    if (filters.page) params.append('page', filters.page.toString())
    if (filters.limit) params.append('limit', filters.limit.toString())
    if (filters.search) params.append('search', filters.search)
    if (filters.status) params.append('status', filters.status)
    
    const response = await apiClient.get<ApiResponse<PaginatedResponse<Client>>>(`/clients?${params}`)
    return response.data.data
  },

  get: async (id: string): Promise<Client> => {
    const response = await apiClient.get<ApiResponse<Client>>(`/clients/${id}`)
    return response.data.data
  },

  create: async (data: CreateClientData): Promise<Client> => {
    const response = await apiClient.post<ApiResponse<Client>>('/clients', data)
    return response.data.data
  },

  update: async (id: string, data: Partial<CreateClientData>): Promise<Client> => {
    const response = await apiClient.patch<ApiResponse<Client>>(`/clients/${id}`, data)
    return response.data.data
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/clients/${id}`)
  },
}
