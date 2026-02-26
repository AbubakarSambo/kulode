import apiClient from './client'
import type { InventoryItem, StockMovement, ApiResponse } from '@/types'

export interface CreateInventoryItemData {
  name: string
  description?: string
  unitPrice: number
  initialStock?: number
  reorderLevel?: number
  sku?: string
}

export interface UpdateInventoryItemData {
  name?: string
  description?: string
  unitPrice?: number
  reorderLevel?: number
  sku?: string
}

export interface AdjustStockData {
  type: 'RESTOCK' | 'ADJUSTMENT'
  quantity: number
  notes?: string
}

export const inventoryApi = {
  list: async (): Promise<InventoryItem[]> => {
    const response = await apiClient.get<ApiResponse<InventoryItem[]>>('/inventory-items')
    return response.data.data
  },

  create: async (data: CreateInventoryItemData): Promise<InventoryItem> => {
    const response = await apiClient.post<ApiResponse<InventoryItem>>('/inventory-items', data)
    return response.data.data
  },

  update: async (id: string, data: UpdateInventoryItemData): Promise<InventoryItem> => {
    const response = await apiClient.patch<ApiResponse<InventoryItem>>(`/inventory-items/${id}`, data)
    return response.data.data
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/inventory-items/${id}`)
  },

  adjustStock: async (id: string, data: AdjustStockData): Promise<{ message: string }> => {
    const response = await apiClient.post<ApiResponse<{ message: string }>>(`/inventory-items/${id}/adjust`, data)
    return response.data.data
  },

  getMovements: async (id: string): Promise<StockMovement[]> => {
    const response = await apiClient.get<ApiResponse<StockMovement[]>>(`/inventory-items/${id}/movements`)
    return response.data.data
  },
}
