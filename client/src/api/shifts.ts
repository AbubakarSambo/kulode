import apiClient from './client'
import type { ApiResponse, Shift } from '@/types'

export interface OpenShiftData {
  openingFloat?: number
}

export interface CloseShiftData {
  countedCash: number
  notes?: string
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
  open: async (data: OpenShiftData): Promise<Shift> => {
    const response = await apiClient.post<ApiResponse<Shift>>('/shifts/open', data)
    return response.data.data
  },
  close: async (id: string, data: CloseShiftData): Promise<Shift> => {
    const response = await apiClient.post<ApiResponse<Shift>>(`/shifts/${id}/close`, data)
    return response.data.data
  },
}
