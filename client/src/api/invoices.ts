import apiClient from './client'
import type { Invoice, InvoiceStatus, ServiceItem, PaginatedResponse, ApiResponse } from '@/types'

export interface InvoiceFilters {
  page?: number
  limit?: number
  status?: InvoiceStatus
  clientId?: string
  startDate?: string
  endDate?: string
}

export interface CreateInstallmentData {
  label: string
  percentage: number
}

export interface CreateInvoiceData {
  clientId: string
  issueDate: string
  dueDate: string
  items: Array<{
    serviceItemId?: string
    description: string
    quantity: number
    unitPrice: number
  }>
  discountType?: 'PERCENTAGE' | 'FIXED'
  discountPercent?: number
  installments?: CreateInstallmentData[]
  notes?: string
  terms?: string
}

export const invoicesApi = {
  list: async (filters: InvoiceFilters = {}): Promise<PaginatedResponse<Invoice>> => {
    const params = new URLSearchParams()
    if (filters.page) params.append('page', filters.page.toString())
    if (filters.limit) params.append('limit', filters.limit.toString())
    if (filters.status) params.append('status', filters.status)
    if (filters.clientId) params.append('clientId', filters.clientId)
    if (filters.startDate) params.append('startDate', filters.startDate)
    if (filters.endDate) params.append('endDate', filters.endDate)
    
    const response = await apiClient.get<ApiResponse<PaginatedResponse<Invoice>>>(`/invoices?${params}`)
    return response.data.data
  },

  get: async (id: string): Promise<Invoice> => {
    const response = await apiClient.get<ApiResponse<Invoice>>(`/invoices/${id}`)
    return response.data.data
  },

  create: async (data: CreateInvoiceData): Promise<Invoice> => {
    const response = await apiClient.post<ApiResponse<Invoice>>('/invoices', data)
    return response.data.data
  },

  update: async (id: string, data: Partial<CreateInvoiceData>): Promise<Invoice> => {
    const response = await apiClient.patch<ApiResponse<Invoice>>(`/invoices/${id}`, data)
    return response.data.data
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/invoices/${id}`)
  },

  send: async (id: string): Promise<Invoice> => {
    const response = await apiClient.post<ApiResponse<Invoice>>(`/invoices/${id}/send`)
    return response.data.data
  },

  cancel: async (id: string): Promise<Invoice> => {
    const response = await apiClient.post<ApiResponse<Invoice>>(`/invoices/${id}/cancel`)
    return response.data.data
  },

  generatePaymentLink: async (id: string, email: string, amount: number): Promise<{ paymentUrl: string; reference: string }> => {
    const response = await apiClient.post<ApiResponse<{ paymentUrl: string; reference: string }>>(`/invoices/${id}/generate-payment-link`, { email, amount })
    return response.data.data
  },

  // Service Items
  listServiceItems: async (): Promise<ServiceItem[]> => {
    const response = await apiClient.get<ApiResponse<ServiceItem[]>>('/service-items')
    return response.data.data
  },

  createServiceItem: async (data: { name: string; description?: string; unitPrice: number }): Promise<ServiceItem> => {
    const response = await apiClient.post<ApiResponse<ServiceItem>>('/service-items', data)
    return response.data.data
  },

  updateServiceItem: async (id: string, data: { name?: string; description?: string; unitPrice?: number }): Promise<ServiceItem> => {
    const response = await apiClient.patch<ApiResponse<ServiceItem>>(`/service-items/${id}`, data)
    return response.data.data
  },

  deleteServiceItem: async (id: string): Promise<void> => {
    await apiClient.delete(`/service-items/${id}`)
  },
}
