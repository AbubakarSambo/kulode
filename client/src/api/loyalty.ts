import apiClient from './client'
import type { ApiResponse } from '@/types'

export interface LoyaltyRule {
  id: string
  name: string
  thresholdAmount: number
  repeating: boolean
  maxPerOrder: number | null
  /** Only sent to admins */
  foodCost?: number
  isActive: boolean
  items: { id: string; name: string }[]
}

export interface MemberDiscount {
  id: string
  name: string
  ratePct: number
  menuItemIds: string[]
  categoryIds: string[]
  isActive: boolean
}

export interface MemberDiscountInput {
  id?: string
  name: string
  ratePct: number
  menuItemIds: string[]
  categoryIds: string[]
  isActive?: boolean
}

export interface LoyaltySettings {
  /** Member discounts, so the till can offer "Apply member discount" */
  discounts: MemberDiscount[]
  enabled: boolean
  /** False for retail organizations, which can't use loyalty */
  available: boolean
  startAt: string | null
  expiryDays: number
  rules: LoyaltyRule[]
}

export interface LoyaltyRuleInput {
  id?: string
  name: string
  thresholdAmount: number
  repeating: boolean
  maxPerOrder?: number | null
  foodCost?: number
  menuItemIds: string[]
  isActive?: boolean
}

export interface LoyaltySettingsInput {
  enabled?: boolean
  expiryDays?: number
  rules?: LoyaltyRuleInput[]
  discounts?: MemberDiscountInput[]
}

export type EnrolSource = 'ORDER' | 'PAY' | 'QUICK_ADD' | 'CUSTOMER_FORM'

export interface EnrolMemberData {
  customerId?: string
  phone?: string
  name?: string
  email?: string
  /** Staff confirm the customer agreed to receive loyalty messages */
  consent: boolean
  source: EnrolSource
  orderId?: string
  clientRequestId?: string
}

export interface EnrolMemberResult {
  customer: { id: string; name: string; phone: string | null; isMember: boolean }
  /** False when they were already a member */
  enrolled: boolean
  /** True when saving their number also earned the staff member a phone-collection credit */
  phoneCredited: boolean
}

export interface MemberReward {
  id: string
  ruleId: string
  name: string
  expiresAt: string
  /** Most of this reward usable on one order (null = no limit) */
  maxPerOrder: number | null
  /** The items the customer can choose from */
  items: { id: string; name: string }[]
}

export interface MemberSummary {
  customer: { id: string; name: string; phone: string | null; isMember: boolean; lifetimeSpend: number; enrolledAt: string | null }
  rewards: MemberReward[]
  progress: { ruleId: string; name: string; toNext: number }[]
}

export interface LoyaltyReport {
  range: { from: string; to: string }
  members: { total: number; newInPeriod: number; byStaff: { userId: string | null; name: string; count: number }[] }
  spend: { total: number; member: number; nonMember: number; memberSharePct: number; orders: number }
  rewards: { earned: number; redeemed: number; expired: number }
  cost: { foodCost: number; menuValue: number; pctOfMemberSpend: number }
  outstanding: { rewards: number; foodCost: number }
}

export interface CoverageReport {
  live: { customers: number; withPhone: number; pct: number }
  days: { date: string; customers: number; withPhone: number; pct: number }[]
}

export interface WelcomeQueueEntry {
  id: string
  customerId: string
  name: string
  phone: string | null
  reason: string
  createdAt: string
}

export const loyaltyApi = {
  settings: async (): Promise<LoyaltySettings> => {
    const response = await apiClient.get<ApiResponse<LoyaltySettings>>('/loyalty/settings')
    return response.data.data
  },
  updateSettings: async (data: LoyaltySettingsInput): Promise<LoyaltySettings> => {
    const response = await apiClient.put<ApiResponse<LoyaltySettings>>('/loyalty/settings', data)
    return response.data.data
  },
  report: async (range: { from?: string; to?: string } = {}): Promise<LoyaltyReport> => {
    const response = await apiClient.get<ApiResponse<LoyaltyReport>>('/loyalty/reports/summary', { params: range })
    return response.data.data
  },
  coverage: async (days = 60): Promise<CoverageReport> => {
    const response = await apiClient.get<ApiResponse<CoverageReport>>('/loyalty/reports/coverage', { params: { days } })
    return response.data.data
  },
  welcomeQueue: async (): Promise<WelcomeQueueEntry[]> => {
    const response = await apiClient.get<ApiResponse<WelcomeQueueEntry[]>>('/loyalty/welcome-queue')
    return response.data.data
  },
  resolveWelcome: async (id: string): Promise<void> => {
    await apiClient.post(`/loyalty/welcome-queue/${id}/resolve`)
  },
  retryWelcome: async (id: string): Promise<void> => {
    await apiClient.post(`/loyalty/welcome-queue/${id}/retry`)
  },
  downloadMembersCsv: async (): Promise<void> => {
    const response = await apiClient.get('/loyalty/members.csv', { responseType: 'blob' })
    const disposition = String(response.headers['content-disposition'] ?? '')
    const filename = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? 'loyalty-members.csv'
    const objectUrl = URL.createObjectURL(new Blob([response.data], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = filename
    a.click()
    URL.revokeObjectURL(objectUrl)
  },
  member: async (customerId: string): Promise<MemberSummary> => {
    const response = await apiClient.get<ApiResponse<MemberSummary>>(`/loyalty/members/${customerId}`)
    return response.data.data
  },
  enrol: async (data: EnrolMemberData): Promise<EnrolMemberResult> => {
    const response = await apiClient.post<ApiResponse<EnrolMemberResult>>('/loyalty/enrol', data)
    return response.data.data
  },
}
