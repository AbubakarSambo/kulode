import apiClient from './client'
import type { ApiResponse } from '@/types'

export type CollectionMode = 'APPROVE' | 'AUTO'

export interface CollectionScheduleStep {
  offsetDays: number
  template: string
}

export interface CollectionPolicy {
  /** False until the business switches reminders on for the first time */
  enabled: boolean
  schedule: CollectionScheduleStep[]
  mode: CollectionMode
  sendHour: number
  maxMessages: number
  paused: boolean
}

export type CollectionPolicyInput = Partial<Omit<CollectionPolicy, 'enabled'>>

export interface PendingReminder {
  id: string
  invoiceId: string
  stepIndex: number
  template: string
  scheduledFor: string
  invoice: {
    invoiceNumber: string
    total: number | string
    amountPaid: number | string
    dueDate: string
    client: { name: string } | null
  }
}

export interface ApproveReminderResult {
  sent: boolean
  reason?: string
}

export const invoiceCollectionsApi = {
  policy: async (): Promise<CollectionPolicy> => {
    const response = await apiClient.get<ApiResponse<CollectionPolicy>>('/invoice-collections/policy')
    return response.data.data
  },
  updatePolicy: async (data: CollectionPolicyInput): Promise<CollectionPolicy> => {
    const response = await apiClient.put<ApiResponse<CollectionPolicy>>('/invoice-collections/policy', data)
    return response.data.data
  },
  pending: async (): Promise<PendingReminder[]> => {
    const response = await apiClient.get<ApiResponse<PendingReminder[]>>('/invoice-collections/reminders/pending')
    return response.data.data
  },
  approve: async (id: string): Promise<ApproveReminderResult> => {
    const response = await apiClient.post<ApiResponse<ApproveReminderResult>>(`/invoice-collections/reminders/${id}/approve`)
    return response.data.data
  },
  skip: async (id: string): Promise<void> => {
    await apiClient.post(`/invoice-collections/reminders/${id}/skip`)
  },
}
