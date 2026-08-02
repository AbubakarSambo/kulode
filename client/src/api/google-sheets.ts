import apiClient from './client'
import type { ApiResponse } from '@/types'

export const googleSheetsApi = {
  getSyncEmail: async (): Promise<{ email: string }> => {
    const response = await apiClient.get<ApiResponse<{ email: string }>>('/google-sheets/sync-email')
    return response.data.data
  },
}
