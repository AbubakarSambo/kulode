import apiClient from './client'
import type { AuthResponse, RegisterResponse, TokenValidation, LoginCredentials, RegisterData, User, ApiResponse } from '@/types'

export const authApi = {
  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    const response = await apiClient.post<ApiResponse<AuthResponse>>('/auth/login', credentials)
    return response.data.data
  },

  pinLogin: async (organizationId: string, pin: string): Promise<AuthResponse> => {
    const response = await apiClient.post<ApiResponse<AuthResponse>>('/auth/pin-login', { organizationId, pin })
    return response.data.data
  },

  register: async (data: RegisterData): Promise<RegisterResponse> => {
    const response = await apiClient.post<ApiResponse<RegisterResponse>>('/auth/register', data)
    return response.data.data
  },

  registerMagicLink: async (data: Omit<RegisterData, 'password'>): Promise<RegisterResponse> => {
    const response = await apiClient.post<ApiResponse<RegisterResponse>>('/auth/register-magic-link', data)
    return response.data.data
  },

  getProfile: async (): Promise<User & { organization: { id: string; name: string; slug: string; isPaystackVerified: boolean } }> => {
    const response = await apiClient.get<ApiResponse<User & { organization: any }>>('/auth/me')
    return response.data.data
  },

  updateProfile: async (userId: string, data: { firstName?: string; lastName?: string; businessRole?: string }): Promise<User> => {
    const response = await apiClient.patch<ApiResponse<User>>(`/users/${userId}`, data)
    return response.data.data
  },

  verifyEmail: async (token: string): Promise<AuthResponse> => {
    const response = await apiClient.post<ApiResponse<AuthResponse>>('/auth/verify-email', { token })
    return response.data.data
  },

  setPassword: async (token: string, password: string): Promise<AuthResponse> => {
    const response = await apiClient.post<ApiResponse<AuthResponse>>('/auth/set-password', { token, password })
    return response.data.data
  },

  resendVerification: async (email: string): Promise<{ message: string }> => {
    const response = await apiClient.post<ApiResponse<{ message: string }>>('/auth/resend-verification', { email })
    return response.data.data
  },

  validateToken: async (token: string, type: string): Promise<TokenValidation> => {
    const response = await apiClient.get<ApiResponse<TokenValidation>>('/auth/validate-token', {
      params: { token, type },
    })
    return response.data.data
  },

  forgotPassword: async (email: string): Promise<{ message: string }> => {
    const response = await apiClient.post<ApiResponse<{ message: string }>>('/auth/forgot-password', { email })
    return response.data.data
  },

  resetPassword: async (token: string, password: string): Promise<AuthResponse> => {
    const response = await apiClient.post<ApiResponse<AuthResponse>>('/auth/reset-password', { token, password })
    return response.data.data
  },
}
