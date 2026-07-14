import apiClient from './client'
import type { ApiResponse } from '@/types'

export interface Bank {
  name: string
  code: string
}

export const paystackApi = {
  getBanks: async (): Promise<Bank[]> => {
    const response = await apiClient.get<ApiResponse<Bank[]>>('/paystack/banks')
    return response.data.data
  },
  verifyAccount: async (data: { accountNumber: string; bankCode: string }) => {
    const response = await apiClient.post<ApiResponse<{ account_name: string }>>('/paystack/verify-account', data)
    return response.data.data
  },
}
