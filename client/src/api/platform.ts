import apiClient from './client'
import type { PlatformDashboard, ApiResponse } from '@/types'

export const platformApi = {
  getDashboard: async (): Promise<PlatformDashboard> => {
    const response = await apiClient.get<ApiResponse<PlatformDashboard>>('/platform/dashboard')
    return response.data.data
  },
}
