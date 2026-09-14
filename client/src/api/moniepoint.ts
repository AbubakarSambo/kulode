import apiClient from './client'
import type { ApiResponse } from '@/types'

export interface MoniepointStatus {
  isSetup: boolean
  terminalSerial: string | null
  isWebhookSubscribed: boolean
  hasWebhookSecret: boolean
}

export interface MoniepointSetupData {
  clientId: string
  clientSecret: string
  terminalSerial: string
  businessId?: number
}

export const moniepointApi = {
  getStatus: async (): Promise<MoniepointStatus> => {
    const response = await apiClient.get<ApiResponse<MoniepointStatus>>('/organizations/moniepoint-status')
    return response.data.data
  },
  setup: async (data: MoniepointSetupData) => {
    const response = await apiClient.post<ApiResponse<{ success: boolean }>>('/organizations/setup-moniepoint', data)
    return response.data.data
  },
  disconnect: async () => {
    const response = await apiClient.delete<ApiResponse<{ success: boolean }>>('/organizations/moniepoint')
    return response.data.data
  },
  subscribeWebhook: async () => {
    const response = await apiClient.post<ApiResponse<{ id: string; endpointUrl: string; status: string }>>(
      '/organizations/moniepoint-subscribe-webhook',
    )
    return response.data.data
  },
  setWebhookSecret: async (webhookSecret: string) => {
    const response = await apiClient.post<ApiResponse<{ success: boolean }>>('/organizations/moniepoint-webhook-secret', {
      webhookSecret,
    })
    return response.data.data
  },
}
