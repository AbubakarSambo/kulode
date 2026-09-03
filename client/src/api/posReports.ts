import apiClient from './client'
import type { ApiResponse } from '@/types'

export interface ItemSalesCategoryRow {
  category: string
  amount: number
  percent: number
}

export interface ItemSalesQuantityRow {
  category: string
  quantity: number
  percent: number
}

export interface ItemSalesProductRow {
  name: string
  quantity: number
  amount: number
}

export interface ItemSalesReport {
  from: string
  to: string
  period: { startDate: string; endDate: string }
  totalSales: number
  totalQuantity: number
  orders: number
  cashiers: string[]
  salesByCategory: ItemSalesCategoryRow[]
  quantitiesByCategory: ItemSalesQuantityRow[]
  products: ItemSalesProductRow[]
}

export const posReportsApi = {
  getItemSales: async (from: string, to?: string, fromTime?: string, toTime?: string): Promise<ItemSalesReport> => {
    const response = await apiClient.get<ApiResponse<ItemSalesReport>>('/pos-reports/item-sales', {
      params: { from, to, fromTime, toTime },
    })
    return response.data.data
  },
}
