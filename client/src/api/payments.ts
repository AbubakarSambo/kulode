import apiClient from './client'
import type { Payment, PaymentMethod, PaginatedResponse, ApiResponse } from '@/types'

export interface PaymentFilters {
  page?: number
  limit?: number
  paymentMethod?: PaymentMethod
  invoiceId?: string
  startDate?: string
  endDate?: string
}

export interface CreatePaymentData {
  amount: number
  paymentMethod: PaymentMethod
  paymentDate: string
  reference?: string
  notes?: string
}

export const paymentsApi = {
  list: async (filters: PaymentFilters = {}): Promise<PaginatedResponse<Payment>> => {
    const params = new URLSearchParams()
    if (filters.page) params.append('page', filters.page.toString())
    if (filters.limit) params.append('limit', filters.limit.toString())
    if (filters.paymentMethod) params.append('paymentMethod', filters.paymentMethod)
    if (filters.invoiceId) params.append('invoiceId', filters.invoiceId)
    if (filters.startDate) params.append('startDate', filters.startDate)
    if (filters.endDate) params.append('endDate', filters.endDate)
    
    const response = await apiClient.get<ApiResponse<PaginatedResponse<Payment>>>(`/payments?${params}`)
    return response.data.data
  },

  get: async (id: string): Promise<Payment> => {
    const response = await apiClient.get<ApiResponse<Payment>>(`/payments/${id}`)
    return response.data.data
  },

  createForInvoice: async (invoiceId: string, data: CreatePaymentData): Promise<Payment> => {
    const response = await apiClient.post<ApiResponse<Payment>>(`/invoices/${invoiceId}/payments`, data)
    return response.data.data
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/payments/${id}`)
  },

  downloadReceipt: async (id: string): Promise<Blob> => {
    const response = await apiClient.get(`/payments/${id}/receipt`, {
      responseType: 'blob',
    })
    return response.data
  },
}
