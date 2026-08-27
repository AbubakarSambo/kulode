import apiClient from './client'
import type {
  PlatformDashboard,
  PlatformPosDashboard,
  ApiResponse,
  PlatformOrganizationsResponse,
  PlatformOrganizationDetails,
  PlatformOrganization,
  PendingVendorPayout,
  OrgModule,
} from '@/types'

export const platformApi = {
  getDashboard: async (startDate?: string, endDate?: string): Promise<PlatformDashboard> => {
    const response = await apiClient.get<ApiResponse<PlatformDashboard>>('/platform/dashboard', {
      params: { startDate, endDate }
    })
    return response.data.data
  },

  getPosDashboard: async (startDate?: string, endDate?: string): Promise<PlatformPosDashboard> => {
    const response = await apiClient.get<ApiResponse<PlatformPosDashboard>>('/platform/pos-dashboard', {
      params: { startDate, endDate },
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
      enabledModules?: OrgModule
    }
  ): Promise<PlatformOrganization> => {
    const response = await apiClient.patch<ApiResponse<PlatformOrganization>>(`/platform/organizations/${id}`, data)
    return response.data.data
  },

  getPendingVendorPayouts: async (): Promise<PendingVendorPayout[]> => {
    const response = await apiClient.get<ApiResponse<PendingVendorPayout[]>>('/platform/vendor-payouts/pending')
    return response.data.data
  },

  activateVendorPayout: async (vendorId: string): Promise<PendingVendorPayout> => {
    const response = await apiClient.patch<ApiResponse<PendingVendorPayout>>(`/platform/vendor-payouts/${vendorId}/activate`)
    return response.data.data
  },
}

