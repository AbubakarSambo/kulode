import apiClient from './client'
import type { ApiResponse, Shift } from '@/types'

export interface OpenShiftData {
  openingFloat?: number
}

export interface BackdateShiftData {
  openedAt: string
  openingFloat?: number
  staffId?: string
  notes?: string
}

export interface CloseShiftData {
  countedCash: number
  countedAmounts?: Record<string, number>
  notes?: string
}

export interface ShiftClosePreview {
  openingFloat: number
  // Expected per method, with any card/transfer tips that came in on it included.
  breakdown: { paymentMethod: string; expectedAmount: number }[]
  // Total of those tips — held for waiters, not takings.
  tipsHeld?: number
  // Cash paid out of the drawer to waiters this shift; the cash count should be this much lower.
  tipPayoutsFromTill?: number
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
  openBackdated: async (data: BackdateShiftData): Promise<Shift> => {
    const response = await apiClient.post<ApiResponse<Shift>>('/shifts/open-backdated', data)
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
