import apiClient from './client'
import type { DeductibleSummary, TaxFilingPreview, TaxReportLog, ApiResponse } from '@/types'

export const taxApi = {
  getDeductibleSummary: async (year?: number): Promise<DeductibleSummary> => {
    const params = year ? `?year=${year}` : ''
    const response = await apiClient.get<ApiResponse<DeductibleSummary>>(`/tax/deductible-summary${params}`)
    return response.data.data
  },

  getFilingPackPreview: async (startDate: string, endDate: string): Promise<TaxFilingPreview> => {
    const response = await apiClient.get<ApiResponse<TaxFilingPreview>>(
      `/tax/filing-pack/preview?startDate=${startDate}&endDate=${endDate}`,
    )
    return response.data.data
  },

  downloadPdfSummary: (startDate: string, endDate: string): string => {
    return `/tax/filing-pack/download/pdf-summary?startDate=${startDate}&endDate=${endDate}`
  },

  downloadCsv: (startDate: string, endDate: string): string => {
    return `/tax/filing-pack/download/csv?startDate=${startDate}&endDate=${endDate}`
  },

  getReportLogs: async (): Promise<TaxReportLog[]> => {
    const response = await apiClient.get<ApiResponse<TaxReportLog[]>>('/tax/report-logs')
    return response.data.data
  },

  // Triggers a POST download through the API client (to carry auth header) and returns blob URL
  triggerDownload: async (url: string, filename: string): Promise<void> => {
    const response = await apiClient.post(url, undefined, { responseType: 'blob' })
    const blob = new Blob([response.data], { type: response.headers['content-type'] })
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = filename
    a.click()
    URL.revokeObjectURL(objectUrl)
  },
}
