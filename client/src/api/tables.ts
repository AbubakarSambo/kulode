import apiClient from './client'
import type { ApiResponse, RestaurantTable, TableStatus } from '@/types'

export interface CreateTableData {
  name: string
  section?: string
  capacity?: number
}

export interface UpdateTableData {
  name?: string
  section?: string
  capacity?: number
  isActive?: boolean
}

export const tablesApi = {
  list: async (): Promise<RestaurantTable[]> => {
    const response = await apiClient.get<ApiResponse<RestaurantTable[]>>('/restaurant-tables')
    return response.data.data
  },
  get: async (id: string): Promise<RestaurantTable> => {
    const response = await apiClient.get<ApiResponse<RestaurantTable>>(`/restaurant-tables/${id}`)
    return response.data.data
  },
  create: async (data: CreateTableData): Promise<RestaurantTable> => {
    const response = await apiClient.post<ApiResponse<RestaurantTable>>('/restaurant-tables', data)
    return response.data.data
  },
  update: async (id: string, data: UpdateTableData): Promise<RestaurantTable> => {
    const response = await apiClient.patch<ApiResponse<RestaurantTable>>(`/restaurant-tables/${id}`, data)
    return response.data.data
  },
  updateStatus: async (id: string, status: TableStatus): Promise<RestaurantTable> => {
    const response = await apiClient.patch<ApiResponse<RestaurantTable>>(`/restaurant-tables/${id}/status`, { status })
    return response.data.data
  },
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/restaurant-tables/${id}`)
  },
}
