import apiClient from './client'
import type { ApiResponse } from '@/types'
import type { ReportFilters } from './reports'

export interface Insight {
  title: string
  body: string
  recommendation: string
  sentiment: 'positive' | 'warning' | 'neutral'
  category: 'revenue' | 'expenses' | 'clients' | 'collections' | 'products'
}

export interface InsightsResponse {
  summary: string
  insights: Insight[]
  period: { startDate: string; endDate: string }
}

export const aiApi = {
  getInsights: async (filters: ReportFilters = {}): Promise<InsightsResponse> => {
    const params = new URLSearchParams()
    if (filters.period) params.append('period', filters.period)
    if (filters.startDate) params.append('startDate', filters.startDate)
    if (filters.endDate) params.append('endDate', filters.endDate)

    const response = await apiClient.get<ApiResponse<InsightsResponse>>(`/ai/insights?${params}`)
    return response.data.data
  },
}
