// Plan types
export type PlanTier = 'FREE' | 'PRO' | 'BUSINESS'
export type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED'
export type BillingPeriod = 'MONTHLY' | 'ANNUAL'

export interface PlanInfo {
  planTier: PlanTier
  subscriptionStatus: SubscriptionStatus
  trialEndDate?: string
  isGrandfathered: boolean
}

export interface SubscriptionDetails {
  planTier: PlanTier
  effectivePlan: PlanTier
  subscriptionStatus: SubscriptionStatus
  billingPeriod?: BillingPeriod
  trialEndDate?: string
  trialDaysRemaining: number | null
  subscriptionStartDate?: string
  subscriptionEndDate?: string
  isGrandfathered: boolean
  limits: {
    maxUsers: number
    maxInvoicesPerMonth: number
    restrictedPages: string[]
  }
  usage: {
    invoicesThisMonth: number
    activeUsers: number
  }
}

export interface SubscriptionPaymentRecord {
  id: string
  amount: number
  currency: string
  billingPeriod: BillingPeriod
  planTier: PlanTier
  paystackReference: string
  status: string
  paidAt: string
  periodStart: string
  periodEnd: string
  createdAt: string
}

// Auth types
export interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  role: UserRole
  organizationId: string
  organizationName: string
  isEmailVerified?: boolean
  isPlatformAdmin?: boolean
  plan?: PlanInfo
}

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'ACCOUNTANT' | 'STAFF'

export interface AuthResponse {
  accessToken: string
  user: User
}

export interface RegisterResponse {
  message: string
  email: string
}

export interface TokenValidation {
  valid: boolean
  email?: string
  firstName?: string
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
  vatEnabled: boolean
  paymentTerms?: string
  defaultNotes?: string
  isPaystackVerified: boolean
  bankAccountName?: string
  settlementBank?: string
}

// Onboarding
export interface OnboardingStatus {
  steps: {
    businessProfile: boolean
    serviceItems: boolean
    firstClient: boolean
    firstInvoice: boolean
    onlinePayments: boolean
    expenseCategories: boolean
  }
  completedCount: number
  totalSteps: number
  allComplete: boolean
  dismissed: boolean
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
  taxRate?: number
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

// Vendor types
export interface Vendor {
  id: string
  name: string
  serviceDescription?: string
  contactPerson?: string
  phone?: string
  email?: string
  bankAccountNumber?: string
  bankName?: string
  isActive: boolean
  createdAt: string
  updatedAt: string
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

// Platform admin types
export interface PlatformDashboard {
  organizations: {
    total: number
    newThisWeek: number
    newThisMonth: number
    active: number
    inactive: number
  }
  users: {
    total: number
  }
  revenue: {
    gmv: number
    platformFees: number
  }
  invoices: Record<string, { count: number; total: number }>
  recentSignups: Array<{
    id: string
    name: string
    slug: string
    userCount: number
    invoiceCount: number
    createdAt: string
  }>
  topOrganizations: Array<{
    id: string
    name: string
    slug: string
    userCount: number
    invoiceCount: number
    volume: number
    createdAt: string
  }>
}
