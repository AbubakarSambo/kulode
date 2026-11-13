import apiClient from './client'
import type { Customer, PaginatedResponse, ApiResponse } from '@/types'

export interface CustomerFilters {
  page?: number
  limit?: number
  search?: string
  /** 'owing' = only customers with a negative wallet balance, most owed first */
  balance?: 'owing'
}

export interface WalletSummary {
  owingCount: number
  totalOwed: number
  overLimitCount: number
}

export interface CreateCustomerData {
  name: string
  phone?: string
  email?: string
  notes?: string
  /** Bulk CSV import: the number is saved but earns nobody a phone-collection credit. */
  source?: 'IMPORT'
}

export interface CapturedCustomer {
  id: string
  name: string
  phone: string | null
  isMember?: boolean
}

export type PhoneLookup =
  | { valid: false; reason: string; message: string }
  | { valid: true; e164: string; customer: CapturedCustomer | null }

export interface CapturePhoneData {
  phone: string
  name?: string
  email?: string
  /** Put the number on this existing customer instead of finding or creating one */
  customerId?: string
  source: 'ORDER' | 'PAY'
  orderId?: string
  clientRequestId?: string
}

export interface CapturePhoneResult {
  customer: CapturedCustomer
  created: boolean
  credited: boolean
}

export interface CustomerStats {
  lifetimeSales: number
  lifetimeOrders: number
  lastVisit: string | null
  customerSince: string
  currentCredit: number
  byOrderType: { type: string; total: number; count: number }[]
  topMeals: { id: string; name: string; quantity: number; revenue: number; orders: number }[]
  topDrinks: { id: string; name: string; quantity: number; revenue: number; orders: number }[]
  topProducts: { id: string; name: string; quantity: number; revenue: number; orders: number }[]
  visitsByWeekday: { day: string; count: number }[]
}

export const customersApi = {
  list: async (filters: CustomerFilters = {}): Promise<PaginatedResponse<Customer>> => {
    const params = new URLSearchParams()
    if (filters.page) params.append('page', filters.page.toString())
    if (filters.limit) params.append('limit', filters.limit.toString())
    if (filters.search) params.append('search', filters.search)
    if (filters.balance) params.append('balance', filters.balance)

    const response = await apiClient.get<ApiResponse<PaginatedResponse<Customer>>>(`/customers?${params}`)
    return response.data.data
  },

  getWalletSummary: async (): Promise<WalletSummary> => {
    const response = await apiClient.get<ApiResponse<WalletSummary>>('/customers/wallet-summary')
    return response.data.data
  },

  get: async (id: string): Promise<Customer> => {
    const response = await apiClient.get<ApiResponse<Customer>>(`/customers/${id}`)
    return response.data.data
  },

  getStats: async (id: string): Promise<CustomerStats> => {
    const response = await apiClient.get<ApiResponse<CustomerStats>>(`/customers/${id}/stats`)
    return response.data.data
  },

  lookupPhone: async (phone: string): Promise<PhoneLookup> => {
    const response = await apiClient.get<ApiResponse<PhoneLookup>>('/customers/lookup-phone', { params: { phone } })
    return response.data.data
  },

  capturePhone: async (data: CapturePhoneData): Promise<CapturePhoneResult> => {
    const response = await apiClient.post<ApiResponse<CapturePhoneResult>>('/customers/capture-phone', data)
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
