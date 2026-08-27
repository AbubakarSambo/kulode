import apiClient from './client'
import type { ApiResponse, OrderType } from '@/types'

export interface CreateOrderTypeData {
  name: string
  sortOrder?: number
  requiresTable?: boolean
}

export interface UpdateOrderTypeData {
  name?: string
  sortOrder?: number
  requiresTable?: boolean
  isActive?: boolean
}

export const orderTypesApi = {
  list: async (): Promise<OrderType[]> => {
    const response = await apiClient.get<ApiResponse<OrderType[]>>('/order-types')
    return response.data.data
  },
  create: async (data: CreateOrderTypeData): Promise<OrderType> => {
    const response = await apiClient.post<ApiResponse<OrderType>>('/order-types', data)
    return response.data.data
  },
  update: async (id: string, data: UpdateOrderTypeData): Promise<OrderType> => {
    const response = await apiClient.patch<ApiResponse<OrderType>>(`/order-types/${id}`, data)
    return response.data.data
  },
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/order-types/${id}`)
  },
}
