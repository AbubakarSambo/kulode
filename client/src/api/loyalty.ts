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

export interface LoyaltySettings {
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

export const loyaltyApi = {
  settings: async (): Promise<LoyaltySettings> => {
    const response = await apiClient.get<ApiResponse<LoyaltySettings>>('/loyalty/settings')
    return response.data.data
  },
  updateSettings: async (data: LoyaltySettingsInput): Promise<LoyaltySettings> => {
    const response = await apiClient.put<ApiResponse<LoyaltySettings>>('/loyalty/settings', data)
    return response.data.data
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
