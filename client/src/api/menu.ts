import apiClient from './client'
import type { ApiResponse, MenuCategory, MenuItem } from '@/types'

export interface CreateMenuCategoryData {
  name: string
  sortOrder?: number
}

export interface UpdateMenuCategoryData {
  name?: string
  sortOrder?: number
  isActive?: boolean
}

export interface CreateMenuItemData {
  name: string
  description?: string
  price: number
  categoryIds?: string[]
  inventoryItemId?: string
  imageUrl?: string
}

export interface UpdateMenuItemData {
  name?: string
  description?: string
  price?: number
  categoryIds?: string[]
  inventoryItemId?: string
  imageUrl?: string
  isAvailable?: boolean
}

export const menuCategoriesApi = {
  list: async (): Promise<MenuCategory[]> => {
    const response = await apiClient.get<ApiResponse<MenuCategory[]>>('/menu-categories')
    return response.data.data
  },
  create: async (data: CreateMenuCategoryData): Promise<MenuCategory> => {
    const response = await apiClient.post<ApiResponse<MenuCategory>>('/menu-categories', data)
    return response.data.data
  },
  update: async (id: string, data: UpdateMenuCategoryData): Promise<MenuCategory> => {
    const response = await apiClient.patch<ApiResponse<MenuCategory>>(`/menu-categories/${id}`, data)
    return response.data.data
  },
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/menu-categories/${id}`)
  },
}

export interface MenuItemOrderHistoryEntry {
  id: string
  quantity: number
  unitPrice: number
  amount: number
  createdAt: string
  order: {
    id: string
    status: string
    source: string
    createdAt: string
    waiter?: { id: string; name: string } | null
  }
}

export interface MenuItemHistory {
  itemId: string
  recentOrders: MenuItemOrderHistoryEntry[]
  stats: {
    timesOrdered: number
    totalQuantitySold: number
    totalRevenue: number
    lastOrderedAt: string | null
  }
}

export const menuItemsApi = {
  list: async (categoryId?: string): Promise<MenuItem[]> => {
    const response = await apiClient.get<ApiResponse<MenuItem[]>>('/menu-items', {
      params: categoryId ? { categoryId } : undefined,
    })
    return response.data.data
  },
  get: async (id: string): Promise<MenuItem> => {
    const response = await apiClient.get<ApiResponse<MenuItem>>(`/menu-items/${id}`)
    return response.data.data
  },
  getHistory: async (id: string): Promise<MenuItemHistory> => {
    const response = await apiClient.get<ApiResponse<MenuItemHistory>>(`/menu-items/${id}/history`)
    return response.data.data
  },
  create: async (data: CreateMenuItemData): Promise<MenuItem> => {
    const response = await apiClient.post<ApiResponse<MenuItem>>('/menu-items', data)
    return response.data.data
  },
  update: async (id: string, data: UpdateMenuItemData): Promise<MenuItem> => {
    const response = await apiClient.patch<ApiResponse<MenuItem>>(`/menu-items/${id}`, data)
    return response.data.data
  },
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/menu-items/${id}`)
  },
}
