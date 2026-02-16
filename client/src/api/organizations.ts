import apiClient from './client'
import type { Organization, ApiResponse } from '@/types'

export interface UpdateOrganizationData {
  name?: string
  email?: string
  phone?: string
  address?: string
  invoicePrefix?: string
  taxRate?: number
  paymentTerms?: string
  defaultNotes?: string
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
}
