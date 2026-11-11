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
  macAddress: string | null
  /** Customer bills/receipts are sent to this printer through the print agent. */
  printsBills: boolean
  paperWidthMm: number
  isActive: boolean
  categories: Array<{ categoryId: string; category: { id: string; name: string } }>
}

export interface PrintAgentStatus {
  hasToken: boolean
  /** When the on-site agent last checked in; null if it never has. */
  lastSeenAt: string | null
  online: boolean
}

export interface PrintJobResult {
  id: string
  status: 'PENDING' | 'DISPATCHED' | 'SENT' | 'FAILED'
  error: string | null
}

export interface CreatePrinterData {
  name: string
  station: string
  connectionType?: PrinterConnectionType
  ipAddress?: string
  port?: number
  devicePath?: string
  macAddress?: string
  printsBills?: boolean
  paperWidthMm?: number
}

/** Something the on-site agent found listening for print jobs on the local network. */
export interface DiscoveredDevice {
  ipAddress: string
  port: number
  macAddress: string | null
  /** Set when this device is already saved as a printer. */
  printerId: string | null
  printerName: string | null
}

export interface PrinterDiscovery {
  scanning: boolean
  scannedAt: string | null
  devices: DiscoveredDevice[]
}

export interface UpdatePrinterData {
  name?: string
  station?: string
  connectionType?: PrinterConnectionType
  ipAddress?: string
  port?: number
  devicePath?: string
  isActive?: boolean
  printsBills?: boolean
  paperWidthMm?: number
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
  getAgentStatus: async (): Promise<PrintAgentStatus> => {
    const response = await apiClient.get<ApiResponse<PrintAgentStatus>>('/printers/agent-token/status')
    return response.data.data
  },
  createPairingCode: async (): Promise<{ code: string; expiresAt: string }> => {
    const response = await apiClient.post<ApiResponse<{ code: string; expiresAt: string }>>('/printers/agent-pairing-code')
    return response.data.data
  },
  getDiscovery: async (): Promise<PrinterDiscovery> => {
    const response = await apiClient.get<ApiResponse<PrinterDiscovery>>('/printers/discovery')
    return response.data.data
  },
  requestScan: async (): Promise<{ requestedAt: string }> => {
    const response = await apiClient.post<ApiResponse<{ requestedAt: string }>>('/printers/discovery/scan')
    return response.data.data
  },
  testPrint: async (id: string): Promise<{ jobId: string }> => {
    const response = await apiClient.post<ApiResponse<{ jobId: string }>>(`/printers/${id}/test-print`)
    return response.data.data
  },
  getPrintJob: async (jobId: string): Promise<PrintJobResult> => {
    const response = await apiClient.get<ApiResponse<PrintJobResult>>(`/printers/print-jobs/${jobId}`)
    return response.data.data
  },
  rotateAgentToken: async (): Promise<{ token: string }> => {
    const response = await apiClient.post<ApiResponse<{ token: string }>>('/printers/agent-token/rotate')
    return response.data.data
  },
}
