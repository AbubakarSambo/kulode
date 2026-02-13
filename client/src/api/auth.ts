import apiClient from './client'
import type { AuthResponse, LoginCredentials, RegisterData, User, ApiResponse } from '@/types'

export const authApi = {
  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    const response = await apiClient.post<ApiResponse<AuthResponse>>('/auth/login', credentials)
    return response.data.data
  },

  register: async (data: RegisterData): Promise<AuthResponse> => {
    const response = await apiClient.post<ApiResponse<AuthResponse>>('/auth/register', data)
    return response.data.data
  },

  getProfile: async (): Promise<User & { organization: { id: string; name: string; slug: string; isPaystackVerified: boolean } }> => {
    const response = await apiClient.get<ApiResponse<User & { organization: any }>>('/auth/me')
    return response.data.data
  },
}
