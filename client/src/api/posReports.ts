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

export type SalesDepartmentKey = 'FOOD' | 'DRINK' | 'OTHER' | 'STORE'

export interface SalesBreakdownRow {
  name: string
  quantity: number
  revenue: number
  quantityPercent: number
  revenuePercent: number
  avgPrice: number
}

export interface SalesItemRow {
  name: string
  quantity: number
  revenue: number
}

export interface SalesDepartment extends SalesBreakdownRow {
  key: SalesDepartmentKey
  categories: SalesBreakdownRow[]
  topItems: SalesItemRow[]
  bottomItems: SalesItemRow[]
  zeroSalesCount: number
}

/** See api/src/modules/pos-reports/sales-report.builder.ts for how each number is defined. */
export interface SalesReport {
  organizationName: string
  from: string
  to: string
  period: { startDate: string; endDate: string }
  comparison: { label: string; from: string; to: string; grossSales: number; orders: number; changePercent: number | null }
  headline: {
    grossSales: number
    discounts: number
    netSales: number
    orders: number
    avgCheck: number
    itemsSold: number
    itemsPerOrder: number
  }
  departments: SalesDepartment[]
  totals: { quantity: number; revenue: number; avgPrice: number }
  dayparts: Array<{ name: string; start: string; end: string; orders: number; sales: number; salesPercent: number; avgCheck: number }>
  orderTypes: Array<{ name: string; orders: number; sales: number; salesPercent: number }>
  payments: { total: number; methods: Array<{ method: string; amount: number; percent: number }> }
  staff: Array<{ id: string | null; name: string; orders: number; sales: number; avgCheck: number; voids: number; voidAmount: number; discounts: number }>
  controls: {
    voids: { amount: number; count: number; percentOfSales: number }
    discounts: { amount: number; count: number }
  }
}

export const salesReportApi = {
  get: async (params: {
    from: string
    to?: string
    fromTime?: string
    toTime?: string
    compare?: 'week' | 'month'
  }): Promise<SalesReport> => {
    const response = await apiClient.get<ApiResponse<SalesReport>>('/pos-reports/sales-report', { params })
    return response.data.data
  },
}
