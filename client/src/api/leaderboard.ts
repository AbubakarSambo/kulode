import apiClient from './client'
import type { ApiResponse } from '@/types'

export type LeaderboardMetric = 'REVENUE' | 'AVG_CHECK'
export type LeaderboardRole = 'WAITER' | 'CASHIER'

export interface LeaderboardSettings {
  metrics: LeaderboardMetric[]
  roles: LeaderboardRole[]
  topN: number
  minOrders: number
  showAmountsToAll: boolean
}

export interface LeaderboardEntry {
  rank: number
  userId: string
  name: string
  isYou: boolean
  // 0-100, relative to the leader
  barPercent: number
  // null for other people's rows unless the viewer is allowed to see them (the server decides)
  revenue: number | null
  avgCheck: number | null
  orders: number | null
}

export interface Leaderboard {
  metric: LeaderboardMetric
  period: { from: string; to: string }
  settings: Pick<LeaderboardSettings, 'metrics' | 'topN' | 'minOrders' | 'showAmountsToAll'>
  entries: LeaderboardEntry[]
  you: LeaderboardEntry | null
  qualifying: number
  canCompete: boolean
}

export const leaderboardApi = {
  get: async (params: { from: string; to?: string; metric?: LeaderboardMetric }): Promise<Leaderboard> => {
    const response = await apiClient.get<ApiResponse<Leaderboard>>('/pos-leaderboard', { params })
    return response.data.data
  },
  getSettings: async (): Promise<LeaderboardSettings> => {
    const response = await apiClient.get<ApiResponse<LeaderboardSettings>>('/pos-leaderboard/settings')
    return response.data.data
  },
  updateSettings: async (data: Partial<LeaderboardSettings>): Promise<LeaderboardSettings> => {
    const response = await apiClient.patch<ApiResponse<LeaderboardSettings>>('/pos-leaderboard/settings', data)
    return response.data.data
  },
}
