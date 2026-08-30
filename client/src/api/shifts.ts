import apiClient from './client'
import type { ApiResponse, Shift } from '@/types'

export interface OpenShiftData {
  openingFloat?: number
}

export interface CloseShiftData {
  countedCash: number
  countedAmounts?: Record<string, number>
  notes?: string
}

export interface ShiftClosePreview {
  openingFloat: number
  breakdown: { paymentMethod: string; expectedAmount: number }[]
}

export const shiftsApi = {
  list: async (): Promise<Shift[]> => {
    const response = await apiClient.get<ApiResponse<Shift[]>>('/shifts')
    return response.data.data
  },
  current: async (): Promise<Shift | null> => {
    const response = await apiClient.get<ApiResponse<Shift | null>>('/shifts/current')
    return response.data.data
  },
  previewClose: async (id: string): Promise<ShiftClosePreview> => {
    const response = await apiClient.get<ApiResponse<ShiftClosePreview>>(`/shifts/${id}/preview-close`)
    return response.data.data
  },
  open: async (data: OpenShiftData): Promise<Shift> => {
    const response = await apiClient.post<ApiResponse<Shift>>('/shifts/open', data)
    return response.data.data
  },
  close: async (id: string, data: CloseShiftData): Promise<Shift> => {
    const response = await apiClient.post<ApiResponse<Shift>>(`/shifts/${id}/close`, data)
    return response.data.data
  },
  downloadReport: async (id: string): Promise<Blob> => {
    const response = await apiClient.get(`/shifts/${id}/report`, { responseType: 'blob' })
    return response.data
  },
}
