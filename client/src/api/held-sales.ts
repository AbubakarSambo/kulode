import apiClient from './client'
import type { ApiResponse } from '@/types'

export interface HeldSaleSummary {
  id: string
  label: string | null
  createdAt: string
  heldByName: string
  preview: string[]
  itemCount: number
  total: number
}

export interface RecalledLine {
  inventoryItemId: string
  name: string
  quantity: number
  // Priced from the current catalogue, not what it cost when the cart was parked
  unitPrice: number
  heldUnitPrice: number
  priceChanged: boolean
  unavailable: boolean
}

export interface RecalledSale {
  id: string
  label: string | null
  customerId: string | null
  lines: RecalledLine[]
}

export interface HoldSaleData {
  items: { inventoryItemId: string; quantity: number }[]
  label?: string
  customerId?: string
}

export const heldSalesApi = {
  list: async (): Promise<HeldSaleSummary[]> => {
    const response = await apiClient.get<ApiResponse<HeldSaleSummary[]>>('/held-sales')
    return response.data.data
  },
  hold: async (data: HoldSaleData): Promise<{ id: string }> => {
    const response = await apiClient.post<ApiResponse<{ id: string }>>('/held-sales', data)
    return response.data.data
  },
  recall: async (id: string): Promise<RecalledSale> => {
    const response = await apiClient.post<ApiResponse<RecalledSale>>(`/held-sales/${id}/recall`)
    return response.data.data
  },
  discard: async (id: string): Promise<void> => {
    await apiClient.delete(`/held-sales/${id}`)
  },
}
