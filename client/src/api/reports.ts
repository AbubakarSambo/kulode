import apiClient from './client'
import type { FinancialSummary, CashflowReport, ApiResponse } from '@/types'

export type ReportPeriod = 
  | 'THIS_MONTH' 
  | 'LAST_MONTH' 
  | 'THIS_QUARTER' 
  | 'LAST_QUARTER' 
  | 'THIS_YEAR' 
  | 'LAST_YEAR' 
  | 'CUSTOM'

export interface ReportFilters {
  period?: ReportPeriod
  startDate?: string
  endDate?: string
}

export const reportsApi = {
  getSummary: async (filters: ReportFilters = {}): Promise<FinancialSummary> => {
    const params = new URLSearchParams()
    if (filters.period) params.append('period', filters.period)
    if (filters.startDate) params.append('startDate', filters.startDate)
    if (filters.endDate) params.append('endDate', filters.endDate)
    
    const response = await apiClient.get<ApiResponse<FinancialSummary>>(`/reports/summary?${params}`)
    return response.data.data
  },

  getIncome: async (filters: ReportFilters = {}) => {
    const params = new URLSearchParams()
    if (filters.period) params.append('period', filters.period)
    if (filters.startDate) params.append('startDate', filters.startDate)
    if (filters.endDate) params.append('endDate', filters.endDate)
    
    const response = await apiClient.get<ApiResponse<any>>(`/reports/income?${params}`)
    return response.data.data
  },

  getExpenses: async (filters: ReportFilters = {}) => {
    const params = new URLSearchParams()
    if (filters.period) params.append('period', filters.period)
    if (filters.startDate) params.append('startDate', filters.startDate)
    if (filters.endDate) params.append('endDate', filters.endDate)
    
    const response = await apiClient.get<ApiResponse<any>>(`/reports/expenses?${params}`)
    return response.data.data
  },

  getOutstanding: async () => {
    const response = await apiClient.get<ApiResponse<any>>('/reports/outstanding')
    return response.data.data
  },

  getCashflow: async (filters: ReportFilters = {}): Promise<CashflowReport> => {
    const params = new URLSearchParams()
    if (filters.period) params.append('period', filters.period)
    if (filters.startDate) params.append('startDate', filters.startDate)
    if (filters.endDate) params.append('endDate', filters.endDate)

    const response = await apiClient.get<ApiResponse<CashflowReport>>(`/reports/cashflow?${params}`)
    return response.data.data
  },

  getTopServices: async (filters: ReportFilters = {}) => {
    const params = new URLSearchParams()
    if (filters.period) params.append('period', filters.period)
    if (filters.startDate) params.append('startDate', filters.startDate)
    if (filters.endDate) params.append('endDate', filters.endDate)

    const response = await apiClient.get<ApiResponse<any>>(`/reports/top-services?${params}`)
    return response.data.data
  },

  getTopProducts: async (filters: ReportFilters = {}) => {
    const params = new URLSearchParams()
    if (filters.period) params.append('period', filters.period)
    if (filters.startDate) params.append('startDate', filters.startDate)
    if (filters.endDate) params.append('endDate', filters.endDate)

    const response = await apiClient.get<ApiResponse<any>>(`/reports/top-products?${params}`)
    return response.data.data
  },

  downloadPdf: async (filters: ReportFilters = {}) => {
    const params = new URLSearchParams()
    if (filters.period) params.append('period', filters.period)
    if (filters.startDate) params.append('startDate', filters.startDate)
    if (filters.endDate) params.append('endDate', filters.endDate)

    const response = await apiClient.get(`/reports/pdf?${params}`, {
      responseType: 'blob'
    })
    
    // Create blob link to download
    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    const timestamp = new Date().toISOString().split('T')[0]
    link.setAttribute('download', `Tari1_Report_${filters.period || 'CUSTOM'}_${timestamp}.pdf`)
    document.body.appendChild(link)
    link.click()
    link.parentNode?.removeChild(link)
  },
}
