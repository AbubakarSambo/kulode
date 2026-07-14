import apiClient from './client'
import type { Vendor, PaginatedResponse, ApiResponse } from '@/types'

export interface VendorFilters {
  page?: number
  limit?: number
  search?: string
}

export interface CreateVendorData {
  name: string
  serviceDescription?: string
  contactPerson?: string
  phone?: string
  email?: string
  bankAccountNumber?: string
  bankName?: string
  bankCode?: string
}

export const vendorsApi = {
  list: async (filters: VendorFilters = {}): Promise<PaginatedResponse<Vendor>> => {
    const params = new URLSearchParams()
    if (filters.page) params.append('page', filters.page.toString())
    if (filters.limit) params.append('limit', filters.limit.toString())
    if (filters.search) params.append('search', filters.search)

    const response = await apiClient.get<ApiResponse<PaginatedResponse<Vendor>>>(`/vendors?${params}`)
    return response.data.data
  },

  get: async (id: string): Promise<Vendor> => {
    const response = await apiClient.get<ApiResponse<Vendor>>(`/vendors/${id}`)
    return response.data.data
  },

  create: async (data: CreateVendorData): Promise<Vendor> => {
    const response = await apiClient.post<ApiResponse<Vendor>>('/vendors', data)
    return response.data.data
  },

  update: async (id: string, data: Partial<CreateVendorData> & { isActive?: boolean }): Promise<Vendor> => {
    const response = await apiClient.patch<ApiResponse<Vendor>>(`/vendors/${id}`, data)
    return response.data.data
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/vendors/${id}`)
  },

  pay: async (id: string, amount: number): Promise<{ paymentUrl: string; reference: string }> => {
    const response = await apiClient.post<ApiResponse<{ paymentUrl: string; reference: string }>>(`/vendors/${id}/pay`, { amount })
    return response.data.data
  },
}
