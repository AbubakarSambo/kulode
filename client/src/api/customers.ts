import apiClient from './client'
import type { Customer, PaginatedResponse, ApiResponse } from '@/types'

export interface CustomerFilters {
  page?: number
  limit?: number
  search?: string
}

export interface CreateCustomerData {
  name: string
  phone: string
  email?: string
  notes?: string
}

export const customersApi = {
  list: async (filters: CustomerFilters = {}): Promise<PaginatedResponse<Customer>> => {
    const params = new URLSearchParams()
    if (filters.page) params.append('page', filters.page.toString())
    if (filters.limit) params.append('limit', filters.limit.toString())
    if (filters.search) params.append('search', filters.search)

    const response = await apiClient.get<ApiResponse<PaginatedResponse<Customer>>>(`/customers?${params}`)
    return response.data.data
  },

  get: async (id: string): Promise<Customer> => {
    const response = await apiClient.get<ApiResponse<Customer>>(`/customers/${id}`)
    return response.data.data
  },

  create: async (data: CreateCustomerData): Promise<Customer> => {
    const response = await apiClient.post<ApiResponse<Customer>>('/customers', data)
    return response.data.data
  },

  update: async (id: string, data: Partial<CreateCustomerData>): Promise<Customer> => {
    const response = await apiClient.patch<ApiResponse<Customer>>(`/customers/${id}`, data)
    return response.data.data
  },

  updateCredit: async (id: string, creditLimit: number): Promise<Customer> => {
    const response = await apiClient.patch<ApiResponse<Customer>>(`/customers/${id}/credit`, { creditLimit })
    return response.data.data
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/customers/${id}`)
  },
}
