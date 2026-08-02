import apiClient from './client'
import type { WalletTransaction, PaginatedResponse, ApiResponse } from '@/types'

export interface WalletBalance {
  customerId: string
  balance: number
}

export interface WalletTransactionFilters {
  page?: number
  limit?: number
  type?: WalletTransaction['type']
}

export interface TopUpWalletData {
  amount: number
  paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CARD' | 'OTHER'
  reference?: string
  notes?: string
  clientRequestId: string
}

export interface AdjustWalletData {
  amount: number
  reason: string
  clientRequestId: string
}

export const walletApi = {
  getBalance: async (customerId: string): Promise<WalletBalance> => {
    const response = await apiClient.get<ApiResponse<WalletBalance>>(`/customers/${customerId}/wallet`)
    return response.data.data
  },

  listTransactions: async (
    customerId: string,
    filters: WalletTransactionFilters = {},
  ): Promise<PaginatedResponse<WalletTransaction>> => {
    const response = await apiClient.get<ApiResponse<PaginatedResponse<WalletTransaction>>>(
      `/customers/${customerId}/wallet/transactions`,
      { params: filters },
    )
    return response.data.data
  },

  topUp: async (customerId: string, data: TopUpWalletData): Promise<WalletTransaction> => {
    const response = await apiClient.post<ApiResponse<WalletTransaction>>(
      `/customers/${customerId}/wallet/topup`,
      data,
    )
    return response.data.data
  },

  adjust: async (customerId: string, data: AdjustWalletData): Promise<WalletTransaction> => {
    const response = await apiClient.post<ApiResponse<WalletTransaction>>(
      `/customers/${customerId}/wallet/adjust`,
      data,
    )
    return response.data.data
  },
}
