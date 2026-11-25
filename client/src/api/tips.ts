import apiClient from './client'
import type { ApiResponse } from '@/types'

export interface TipSettings {
  enabled: boolean
  presets: number[]
}

export interface TipOwedRow {
  // null = tips on orders nobody owned
  waiterId: string | null
  name: string
  openingBalance: number
  earned: number
  voided: number
  paidOut: number
  balance: number
}

export interface TipOwedReport {
  from: string
  to: string
  rows: TipOwedRow[]
  totals: { earned: number; voided: number; paidOut: number; balance: number }
}

export interface TipLedgerEntry {
  id: string
  type: 'EARNED' | 'VOIDED' | 'PAYOUT'
  amount: number
  paidFrom: 'CASH_DRAWER' | 'BANK' | null
  note: string | null
  createdAt: string
  orderId: string | null
  paymentMethod: string | null
  approvedBy: string | null
}

export interface TipPayoutInput {
  waiterId?: string
  amount: number
  paidFrom: 'CASH_DRAWER' | 'BANK'
  approverPin?: string
  note?: string
  clientRequestId: string
}

export const tipsApi = {
  settings: async (): Promise<TipSettings> => {
    const response = await apiClient.get<ApiResponse<TipSettings>>('/tips/settings')
    return response.data.data
  },
  updateSettings: async (data: Partial<TipSettings>): Promise<TipSettings> => {
    const response = await apiClient.patch<ApiResponse<TipSettings>>('/tips/settings', data)
    return response.data.data
  },
  owed: async (params: { from?: string; to?: string }): Promise<TipOwedReport> => {
    const response = await apiClient.get<ApiResponse<TipOwedReport>>('/tips/owed', { params })
    return response.data.data
  },
  ledger: async (waiterId?: string): Promise<TipLedgerEntry[]> => {
    const response = await apiClient.get<ApiResponse<TipLedgerEntry[]>>('/tips/ledger', { params: { waiterId } })
    return response.data.data
  },
  payout: async (data: TipPayoutInput): Promise<{ id: string; amount: number; balance: number; paidAt: string }> => {
    const response = await apiClient.post<ApiResponse<{ id: string; amount: number; balance: number; paidAt: string }>>('/tips/payouts', data)
    return response.data.data
  },
}
