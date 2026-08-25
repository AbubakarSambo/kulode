import apiClient from './client'
import type { ApiResponse } from '@/types'

export type PrinterConnectionType = 'NETWORK' | 'USB' | 'BLUETOOTH'

export interface Printer {
  id: string
  name: string
  station: string
  connectionType: PrinterConnectionType
  ipAddress: string | null
  port: number | null
  devicePath: string | null
  isActive: boolean
  categories: Array<{ categoryId: string; category: { id: string; name: string } }>
}

export interface CreatePrinterData {
  name: string
  station: string
  connectionType?: PrinterConnectionType
  ipAddress?: string
  port?: number
  devicePath?: string
}

export interface UpdatePrinterData {
  name?: string
  station?: string
  connectionType?: PrinterConnectionType
  ipAddress?: string
  port?: number
  devicePath?: string
  isActive?: boolean
}

export const printersApi = {
  list: async (): Promise<Printer[]> => {
    const response = await apiClient.get<ApiResponse<Printer[]>>('/printers')
    return response.data.data
  },
  create: async (data: CreatePrinterData): Promise<Printer> => {
    const response = await apiClient.post<ApiResponse<Printer>>('/printers', data)
    return response.data.data
  },
  update: async (id: string, data: UpdatePrinterData): Promise<Printer> => {
    const response = await apiClient.patch<ApiResponse<Printer>>(`/printers/${id}`, data)
    return response.data.data
  },
  setCategories: async (id: string, categoryIds: string[]): Promise<Printer> => {
    const response = await apiClient.put<ApiResponse<Printer>>(`/printers/${id}/categories`, { categoryIds })
    return response.data.data
  },
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/printers/${id}`)
  },
  retryPrintJob: async (jobId: string): Promise<void> => {
    await apiClient.post(`/printers/print-jobs/${jobId}/retry`)
  },
  getAgentStatus: async (): Promise<{ hasToken: boolean }> => {
    const response = await apiClient.get<ApiResponse<{ hasToken: boolean }>>('/printers/agent-token/status')
    return response.data.data
  },
  rotateAgentToken: async (): Promise<{ token: string }> => {
    const response = await apiClient.post<ApiResponse<{ token: string }>>('/printers/agent-token/rotate')
    return response.data.data
  },
}
