import apiClient from './client'
import type { Expense, ExpenseCategory, PaymentMethod, TaxCategory, PaginatedResponse, ApiResponse } from '@/types'

export interface ExpenseFilters {
  page?: number
  limit?: number
  categoryId?: string
  vendorId?: string
  startDate?: string
  endDate?: string
  taxCategory?: TaxCategory
  isDeductible?: boolean
}

export interface CreateExpenseData {
  description: string
  amount: number
  expenseDate: string
  categoryId?: string
  vendorId?: string
  recipient?: string
  paymentMethod: PaymentMethod
  reference?: string
  notes?: string
  taxCategory?: TaxCategory
}

export const expensesApi = {
  list: async (filters: ExpenseFilters = {}): Promise<PaginatedResponse<Expense>> => {
    const params = new URLSearchParams()
    if (filters.page) params.append('page', filters.page.toString())
    if (filters.limit) params.append('limit', filters.limit.toString())
    if (filters.categoryId) params.append('categoryId', filters.categoryId)
    if (filters.vendorId) params.append('vendorId', filters.vendorId)
    if (filters.startDate) params.append('startDate', filters.startDate)
    if (filters.endDate) params.append('endDate', filters.endDate)
    if (filters.taxCategory) params.append('taxCategory', filters.taxCategory)
    if (filters.isDeductible !== undefined) params.append('isDeductible', String(filters.isDeductible))

    const response = await apiClient.get<ApiResponse<PaginatedResponse<Expense>>>(`/expenses?${params}`)
    return response.data.data
  },

  get: async (id: string): Promise<Expense> => {
    const response = await apiClient.get<ApiResponse<Expense>>(`/expenses/${id}`)
    return response.data.data
  },

  create: async (data: CreateExpenseData): Promise<Expense> => {
    const response = await apiClient.post<ApiResponse<Expense>>('/expenses', data)
    return response.data.data
  },

  update: async (id: string, data: Partial<CreateExpenseData>): Promise<Expense> => {
    const response = await apiClient.patch<ApiResponse<Expense>>(`/expenses/${id}`, data)
    return response.data.data
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/expenses/${id}`)
  },

  bulkRecategorize: async (ids: string[], taxCategory: TaxCategory): Promise<{ updated: number }> => {
    const response = await apiClient.patch<ApiResponse<{ updated: number }>>('/expenses/bulk-recategorize', { ids, taxCategory })
    return response.data.data
  },

  // Categories
  listCategories: async (): Promise<ExpenseCategory[]> => {
    const response = await apiClient.get<ApiResponse<ExpenseCategory[]>>('/expense-categories')
    return response.data.data
  },

  createCategory: async (data: { name: string; description?: string }): Promise<ExpenseCategory> => {
    const response = await apiClient.post<ApiResponse<ExpenseCategory>>('/expense-categories', data)
    return response.data.data
  },
}
