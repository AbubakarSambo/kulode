// Auth types
export interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  role: UserRole
  organizationId: string
  organizationName: string
}

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'ACCOUNTANT' | 'STAFF'

export interface AuthResponse {
  accessToken: string
  user: User
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterData {
  organizationName: string
  email: string
  firstName: string
  lastName: string
  password: string
}

// Organization
export interface Organization {
  id: string
  name: string
  slug: string
  email?: string
  phone?: string
  address?: string
  invoicePrefix: string
  currency: string
  taxRate: number
  paymentTerms?: string
  defaultNotes?: string
  isPaystackVerified: boolean
  bankAccountName?: string
  settlementBank?: string
}

// Client types
export interface Client {
  id: string
  name: string
  email?: string
  phone?: string
  address?: string
  notes?: string
  isActive: boolean
  createdAt: string
  _count?: {
    invoices: number
  }
}

// Invoice types
export type InvoiceStatus = 
  | 'DRAFT' 
  | 'SENT' 
  | 'PAID' 
  | 'PARTIALLY_PAID' 
  | 'OVERDUE' 
  | 'CANCELLED'

export interface InvoiceItem {
  id?: string
  description: string
  quantity: number
  unitPrice: number
  amount: number
}

export interface PaymentInstallment {
  id: string
  label: string
  sequence: number
  percentage: number
  amount: number
  isPaid: boolean
  paymentUrl?: string
}

export interface Invoice {
  id: string
  invoiceNumber: string
  status: InvoiceStatus
  issueDate: string
  dueDate: string
  subtotal: number
  discountPercent?: number
  discountAmount?: number
  taxAmount: number
  total: number
  amountPaid: number
  notes?: string
  terms?: string
  paymentUrl?: string
  client: Client
  items: InvoiceItem[]
  installments?: PaymentInstallment[]
  payments?: Payment[]
  createdBy?: {
    id: string
    firstName: string
    lastName: string
  }
  createdAt: string
}

// Payment types
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CARD' | 'PAYSTACK' | 'OTHER'

export interface Payment {
  id: string
  amount: number
  paymentMethod: PaymentMethod
  paymentDate: string
  reference?: string
  notes?: string
  isAutoRecorded: boolean
  paystackFees?: number
  platformFees?: number
  netAmount?: number
  invoice?: {
    id: string
    invoiceNumber: string
    total: number
  }
  recordedBy?: {
    id: string
    firstName: string
    lastName: string
  }
  createdAt: string
}

// Service item types
export interface ServiceItem {
  id: string
  name: string
  description?: string
  unitPrice: number
  isActive: boolean
}

// Expense types
export interface ExpenseCategory {
  id: string
  name: string
  description?: string
  isActive: boolean
}

export interface Expense {
  id: string
  description: string
  amount: number
  expenseDate: string
  recipient?: string
  paymentMethod: PaymentMethod
  reference?: string
  notes?: string
  category?: ExpenseCategory
  recordedBy?: {
    id: string
    firstName: string
    lastName: string
  }
  createdAt: string
}

// Report types
export interface FinancialSummary {
  period: { startDate: string; endDate: string }
  income: { total: number; paymentCount: number }
  expenses: { total: number; expenseCount: number }
  profit: number
  profitMargin: number | string
  invoices: Record<string, { count: number; total: number }>
}

export interface CashflowReport {
  period: { startDate: string; endDate: string }
  monthly: Array<{
    month: string
    income: number
    expenses: number
    net: number
  }>
  totals: {
    income: number
    expenses: number
    net: number
  }
}

// Pagination
export interface PaginatedResponse<T> {
  data: T[]
  meta: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
}

// API Response wrapper
export interface ApiResponse<T> {
  success: boolean
  data: T
}
