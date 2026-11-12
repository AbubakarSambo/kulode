import apiClient from './client'
import type { ApiResponse } from '@/types'

export type Zone = 'RED' | 'NORMAL' | 'GREEN'
export type PeriodPhase = 'UPCOMING' | 'LIVE' | 'FINAL'
export type CollectionRole = 'WAITER' | 'CASHIER' | 'SUPERVISOR' | 'MANAGER'

export interface CollectionEntry {
  rank: number
  userId: string
  name: string
  count: number
  today: number
  minimum: number
  threshold: number
  zone: Zone
  nextStep: string
  isMe: boolean
}

export interface CollectionBoard {
  period: null | {
    id: string
    name: string
    startDate: string
    endDate: string
    status: 'OPEN' | 'LOCKED'
    phase: PeriodPhase
    coverageGoalPct: number
  }
  team?: { count: number; minimum: number; threshold: number }
  coverage?: { customers: number; withPhone: number; pct: number }
  canCompete?: boolean
  entries?: CollectionEntry[]
}

export interface CollectionOverride {
  id: string
  periodId: string
  userId: string
  minimum: number | null
  threshold: number | null
  openingCount: number
}

export interface CollectionPeriod {
  id: string
  name: string
  startDate: string
  endDate: string
  rolesInScope: CollectionRole[]
  minimum: number
  threshold: number
  rewardAmount: string
  deductionPct: number
  coverageGoalPct: number
  status: 'OPEN' | 'LOCKED'
  overrides: CollectionOverride[]
}

export interface CollectionPeriodInput {
  name: string
  startDate: string
  endDate: string
  rolesInScope: CollectionRole[]
  minimum: number
  threshold: number
  rewardAmount?: number
  deductionPct?: number
  coverageGoalPct?: number
}

export interface PhoneCredit {
  id: string
  userId: string
  staffName: string
  customerName: string
  phone: string
  source: 'ORDER' | 'PAY' | 'QUICK_ADD' | 'CUSTOMER_FORM'
  capturedAt: string
  revokedAt: string | null
  revokeReason: string | null
}

export interface QuickAddInput {
  name: string
  phone: string
  email?: string
  collectedById: string
  clientRequestId?: string
}

export const collectionApi = {
  leaderboard: async (periodId?: string): Promise<CollectionBoard> => {
    const response = await apiClient.get<ApiResponse<CollectionBoard>>('/collection/leaderboard', { params: { periodId } })
    return response.data.data
  },
  periods: async (): Promise<CollectionPeriod[]> => {
    const response = await apiClient.get<ApiResponse<CollectionPeriod[]>>('/collection/periods')
    return response.data.data
  },
  createPeriod: async (data: CollectionPeriodInput): Promise<CollectionPeriod> => {
    const response = await apiClient.post<ApiResponse<CollectionPeriod>>('/collection/periods', data)
    return response.data.data
  },
  updatePeriod: async (id: string, data: Partial<CollectionPeriodInput>): Promise<CollectionPeriod> => {
    const response = await apiClient.patch<ApiResponse<CollectionPeriod>>(`/collection/periods/${id}`, data)
    return response.data.data
  },
  setOverride: async (
    periodId: string,
    userId: string,
    data: { minimum?: number; threshold?: number; openingCount?: number },
  ): Promise<CollectionOverride> => {
    const response = await apiClient.put<ApiResponse<CollectionOverride>>(`/collection/periods/${periodId}/overrides/${userId}`, data)
    return response.data.data
  },
  credits: async (params: { periodId?: string; userId?: string } = {}): Promise<PhoneCredit[]> => {
    const response = await apiClient.get<ApiResponse<PhoneCredit[]>>('/collection/credits', { params })
    return response.data.data
  },
  revokeCredit: async (id: string, reason: string): Promise<void> => {
    await apiClient.post(`/collection/credits/${id}/revoke`, { reason })
  },
  quickAdd: async (data: QuickAddInput): Promise<{ id: string; name: string; credited: boolean }> => {
    const response = await apiClient.post<ApiResponse<{ id: string; name: string; credited: boolean }>>('/customers/quick-add', data)
    return response.data.data
  },
}
