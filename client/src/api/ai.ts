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

export interface ChatSession {
  id: string
  title: string
  isPinned: boolean
  createdAt: string
  updatedAt: string
}

export interface ChatMessage {
  id?: string
  sessionId?: string
  role: 'user' | 'assistant'
  content: string
  layout?: any
  createdAt?: string
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

  listSessions: async (search?: string): Promise<ChatSession[]> => {
    const params = new URLSearchParams()
    if (search) params.append('search', search)
    const response = await apiClient.get<ApiResponse<ChatSession[]>>(`/ai/sessions?${params}`)
    return response.data.data
  },

  createSession: async (title: string): Promise<ChatSession> => {
    const response = await apiClient.post<ApiResponse<ChatSession>>('/ai/sessions', { title })
    return response.data.data
  },

  updateSession: async (id: string, data: { title?: string; isPinned?: boolean }): Promise<ChatSession> => {
    const response = await apiClient.patch<ApiResponse<ChatSession>>(`/ai/sessions/${id}`, data)
    return response.data.data
  },

  deleteSession: async (id: string): Promise<void> => {
    await apiClient.delete<ApiResponse<void>>(`/ai/sessions/${id}`)
  },

  getMessages: async (id: string): Promise<ChatMessage[]> => {
    const response = await apiClient.get<ApiResponse<ChatMessage[]>>(`/ai/sessions/${id}/messages`)
    return response.data.data
  },

  chat: async (messages: ChatMessage[], sessionId?: string): Promise<{ message: string; layout?: any; sessionId: string }> => {
    const response = await apiClient.post<ApiResponse<{ message: string; layout?: any; sessionId: string }>>('/ai/chat', { messages, sessionId })
    return response.data.data
  },
}

