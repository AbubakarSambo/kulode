import apiClient from './client'
import type { SubscriptionDetails, SubscriptionPaymentRecord, BillingPeriod, PlanTier, ApiResponse } from '@/types'

export const subscriptionApi = {
  getCurrent: async (): Promise<SubscriptionDetails> => {
    const response = await apiClient.get<ApiResponse<SubscriptionDetails>>('/subscription/current')
    return response.data.data
  },

  subscribe: async (planTier: PlanTier, billingPeriod: BillingPeriod): Promise<{ paymentUrl: string; reference: string }> => {
    const response = await apiClient.post<ApiResponse<{ paymentUrl: string; reference: string }>>('/subscription/subscribe', {
      planTier,
      billingPeriod,
    })
    return response.data.data
  },

  cancel: async (): Promise<{ message: string }> => {
    const response = await apiClient.post<ApiResponse<{ message: string }>>('/subscription/cancel')
    return response.data.data
  },

  getPaymentHistory: async (): Promise<SubscriptionPaymentRecord[]> => {
    const response = await apiClient.get<ApiResponse<SubscriptionPaymentRecord[]>>('/subscription/payment-history')
    return response.data.data
  },
  
  getDirectDebitBanks: async (): Promise<{ name: string; code: string }[]> => {
    const response = await apiClient.get<ApiResponse<{ name: string; code: string }[]>>('/subscription/direct-debit/banks')
    return response.data.data
  },

  setupDirectDebit: async (): Promise<{ paymentUrl: string; reference: string }> => {
    const response = await apiClient.post<ApiResponse<{ paymentUrl: string; reference: string }>>('/subscription/direct-debit/setup')
    return response.data.data
  },

  removeDirectDebit: async (): Promise<{ message: string }> => {
    const response = await apiClient.delete<ApiResponse<{ message: string }>>('/subscription/direct-debit')
    return response.data.data
  },

  toggleAutoRenew: async (enabled: boolean): Promise<{ message: string }> => {
    const response = await apiClient.patch<ApiResponse<{ message: string }>>('/subscription/auto-renew', { enabled })
    return response.data.data
  },
}
