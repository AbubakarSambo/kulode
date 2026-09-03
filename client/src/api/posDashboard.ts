import apiClient from './client'
import type { ApiResponse } from '@/types'
import type { ReportFilters } from './reports'

export interface PosDashboardSummary {
  period: { startDate: string; endDate: string }
  sales: { total: number; change: number; paymentCount: number }
  orderCount: number
  avgOrderValue: number
  orderBreakdown: {
    total: number
    closedPaid: { count: number; amount: number }
    closedUnpaid: { count: number; amount: number; outstanding: number }
    open: { count: number; amount: number }
  }
  byPaymentMethod: { method: string; total: number; count: number }[]
  topItems: { id: string; name: string; quantity: number; revenue: number; orders: number }[]
  topStaff: { id: string; name: string; revenue: number; orders: number }[]
}

export interface PosDashboardTrend {
  period: { startDate: string; endDate: string }
  daily: { day: string; total: number; count: number }[]
}

function buildParams(filters: ReportFilters = {}) {
  const params = new URLSearchParams()
  if (filters.period) params.append('period', filters.period)
  if (filters.startDate) params.append('startDate', filters.startDate)
  if (filters.endDate) params.append('endDate', filters.endDate)
  return params
}

export const posDashboardApi = {
  getSummary: async (filters: ReportFilters = {}): Promise<PosDashboardSummary> => {
    const response = await apiClient.get<ApiResponse<PosDashboardSummary>>(
      `/pos-dashboard/summary?${buildParams(filters)}`,
    )
    return response.data.data
  },

  getTrend: async (filters: ReportFilters = {}): Promise<PosDashboardTrend> => {
    const response = await apiClient.get<ApiResponse<PosDashboardTrend>>(
      `/pos-dashboard/trend?${buildParams(filters)}`,
    )
    return response.data.data
  },
}
