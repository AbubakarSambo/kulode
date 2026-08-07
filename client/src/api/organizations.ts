import apiClient from './client'
import type { Organization, OnboardingStatus, ApiResponse, OrgModule } from '@/types'

export interface UpdateOrganizationData {
  name?: string
  email?: string
  phone?: string
  address?: string
  invoicePrefix?: string
  taxRate?: number
  vatEnabled?: boolean
  showQrCode?: boolean
  paymentTerms?: string
  defaultNotes?: string
  businessType?: string
  organizationSize?: string
  enabledModules?: OrgModule
  rcNumber?: string
  tin?: string
  googleSheetId?: string | null
}

export const organizationsApi = {
  getCurrent: async (): Promise<Organization> => {
    const response = await apiClient.get<ApiResponse<Organization>>('/organizations/current')
    return response.data.data
  },

  updateCurrent: async (data: UpdateOrganizationData): Promise<Organization> => {
    const response = await apiClient.patch<ApiResponse<Organization>>('/organizations/current', data)
    return response.data.data
  },

  getOnboardingStatus: async (): Promise<OnboardingStatus> => {
    const response = await apiClient.get<ApiResponse<OnboardingStatus>>('/organizations/onboarding-status')
    return response.data.data
  },

  dismissOnboarding: async (): Promise<void> => {
    await apiClient.patch('/organizations/onboarding-dismiss')
  },

  uploadLogo: async (file: File): Promise<Organization> => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await apiClient.post<ApiResponse<Organization>>('/organizations/current/logo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data.data
  },

  removeLogo: async (): Promise<Organization> => {
    const response = await apiClient.delete<ApiResponse<Organization>>('/organizations/current/logo')
    return response.data.data
  },
}
