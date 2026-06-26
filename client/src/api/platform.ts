import apiClient from './client'
import type {
  PlatformDashboard,
  ApiResponse,
  PlatformOrganizationsResponse,
  PlatformOrganizationDetails,
  PlatformOrganization,
} from '@/types'

export const platformApi = {
  getDashboard: async (startDate?: string, endDate?: string): Promise<PlatformDashboard> => {
    const response = await apiClient.get<ApiResponse<PlatformDashboard>>('/platform/dashboard', {
      params: { startDate, endDate }
    })
    return response.data.data
  },

  getOrganizations: async (params?: {
    search?: string
    planTier?: string
    subscriptionStatus?: string
    isGrandfathered?: boolean
    page?: number
    limit?: number
  }): Promise<PlatformOrganizationsResponse> => {
    const response = await apiClient.get<ApiResponse<PlatformOrganizationsResponse>>('/platform/organizations', {
      params,
    })
    return response.data.data
  },

  getOrganizationDetails: async (id: string): Promise<PlatformOrganizationDetails> => {
    const response = await apiClient.get<ApiResponse<PlatformOrganizationDetails>>(`/platform/organizations/${id}`)
    return response.data.data
  },

  updateOrganization: async (
    id: string,
    data: {
      planTier?: string
      subscriptionStatus?: string
      isGrandfathered?: boolean
      platformFeePercent?: number
    }
  ): Promise<PlatformOrganization> => {
    const response = await apiClient.patch<ApiResponse<PlatformOrganization>>(`/platform/organizations/${id}`, data)
    return response.data.data
  },
}

