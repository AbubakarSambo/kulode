import apiClient from './client'
import type { ApiResponse, PaymentType } from '@/types'

export interface CreatePaymentTypeData {
  name: string
  sortOrder?: number
}

export interface UpdatePaymentTypeData {
  name?: string
  sortOrder?: number
  isActive?: boolean
}

export const paymentTypesApi = {
  list: async (): Promise<PaymentType[]> => {
    const response = await apiClient.get<ApiResponse<PaymentType[]>>('/payment-types')
    return response.data.data
  },
  create: async (data: CreatePaymentTypeData): Promise<PaymentType> => {
    const response = await apiClient.post<ApiResponse<PaymentType>>('/payment-types', data)
    return response.data.data
  },
  update: async (id: string, data: UpdatePaymentTypeData): Promise<PaymentType> => {
    const response = await apiClient.patch<ApiResponse<PaymentType>>(`/payment-types/${id}`, data)
    return response.data.data
  },
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/payment-types/${id}`)
  },
}
