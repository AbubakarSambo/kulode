// Plan types
export type PlanTier = 'FREE' | 'STARTER' | 'PRO' | 'BUSINESS'
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
  autoRenew: boolean
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
  businessRole?: string
  organization?: {
    id: string
    name: string
    slug: string
    isPaystackVerified: boolean
    businessType?: string
    organizationSize?: string
    vatEnabled?: boolean
    taxRate?: number
    logo?: string
    email?: string
    phone?: string
    address?: string
    paymentTerms?: string
    defaultNotes?: string
  }
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
  logo?: string
  invoicePrefix: string
  currency: string
  taxRate: number
  vatEnabled: boolean
  showQrCode: boolean
  paymentTerms?: string
  defaultNotes?: string
  isPaystackVerified: boolean
  bankAccountName?: string
  bankAccountNumber?: string
  settlementBank?: string
  businessType?: string
  organizationSize?: string
  rcNumber?: string
  tin?: string
  googleSheetId?: string
}

// Onboarding
export interface OnboardingStatus {
  steps: {
    businessProfile: boolean
    inventoryItems: boolean
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
  clientType?: 'individual' | 'business' | string
  whatsappOptIn?: boolean
  whatsappOptInAt?: string
  createdAt: string
  _count?: {
    invoices: number
  }
}

// POS diner profiles — distinct from Client (invoicing customers)
export interface Customer {
  id: string
  name: string
  phone: string
  email?: string
  notes?: string
  isActive: boolean
  walletBalance: number
  createdAt: string
  _count?: {
    orders: number
  }
}

export type WalletTransactionType = 'TOPUP' | 'ORDER_DEBIT' | 'REFUND' | 'ADJUSTMENT'

export interface WalletTransaction {
  id: string
  customerId: string
  type: WalletTransactionType
  amount: number
  balanceBefore: number
  balanceAfter: number
  orderId?: string
  paymentId?: string
  reference?: string
  notes?: string
  createdAt: string
  createdBy?: {
    id: string
    firstName: string
    lastName: string
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
  serviceItemId?: string
  inventoryItemId?: string
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
  shareToken?: string
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
  whatsappMessages?: WhatsappMessage[]
}

export type WhatsappMessageStatus = 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'

export interface WhatsappMessage {
  id: string
  status: WhatsappMessageStatus
  errorMessage?: string | null
  sentAt?: string | null
  createdAt: string
}

// Payment types
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CARD' | 'PAYSTACK' | 'WALLET' | 'OTHER'

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
    client?: {
      id: string
      name: string
    }
  }
  recordedBy?: {
    id: string
    firstName: string
    lastName: string
  }
  createdAt: string
}

// Vendor types
export type PaystackSubaccountStatus = 'PENDING' | 'ACTIVE' | 'FAILED'

export interface Vendor {
  id: string
  name: string
  serviceDescription?: string
  contactPerson?: string
  phone?: string
  email?: string
  bankAccountNumber?: string
  bankName?: string
  bankCode?: string
  isBankVerified?: boolean
  paystackSubaccountCode?: string
  paystackSubaccountStatus?: PaystackSubaccountStatus
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

// Inventory types
export type StockMovementType =
  | 'RESTOCK'
  | 'ADJUSTMENT'
  | 'INVOICE_RESERVED'
  | 'INVOICE_DEDUCTED'
  | 'RESERVATION_RELEASED'

export interface InventoryItem {
  id: string
  name: string
  description?: string
  unitPrice: number
  onHandQuantity: number
  reservedQuantity: number
  availableQuantity: number
  reorderLevel: number
  sku?: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface StockMovement {
  id: string
  organizationId: string
  inventoryItemId: string
  invoiceId?: string
  type: StockMovementType
  quantity: number
  onHandBefore: number
  onHandAfter: number
  notes?: string
  createdById?: string
  createdAt: string
}

// Restaurant POS types
export type TableStatus = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'NEEDS_CLEANING'
export type OrderSource = 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY' | 'THIRD_PARTY'
export type OrderStatus = 'OPEN' | 'IN_KITCHEN' | 'READY' | 'CLOSED_PAID' | 'CLOSED_UNPAID' | 'CANCELLED'
export type OrderItemStatus = 'PENDING' | 'PREPARING' | 'READY' | 'SERVED'
export type ShiftStatus = 'OPEN' | 'CLOSED'

export interface MenuCategory {
  id: string
  name: string
  sortOrder: number
  isActive: boolean
}

export interface MenuItem {
  id: string
  name: string
  description?: string
  price: number
  categoryId?: string
  category?: { id: string; name: string } | null
  inventoryItemId?: string
  imageUrl?: string
  isAvailable: boolean
}

export interface RestaurantTable {
  id: string
  name: string
  section?: string
  capacity: number
  status: TableStatus
  isActive: boolean
}

export interface OrderItem {
  id: string
  menuItemId: string
  menuItem: { id: string; name: string }
  quantity: number
  unitPrice: number
  amount: number
  notes?: string
  status: OrderItemStatus
}

export interface OrderPayment {
  id: string
  amount: number
  paymentMethod: string
  paymentDate: string
}

export interface Order {
  id: string
  organizationId: string
  tableId?: string
  table?: { id: string; name: string; section?: string } | null
  customerId?: string
  customer?: { id: string; name: string; phone: string } | null
  createdById: string
  createdBy?: { id: string; firstName: string; lastName: string }
  source: OrderSource
  status: OrderStatus
  subtotal: number
  taxAmount: number
  total: number
  amountPaid: number
  notes?: string
  closedAt?: string
  createdAt: string
  updatedAt: string
  items: OrderItem[]
  payments: OrderPayment[]
}

export interface Shift {
  id: string
  status: ShiftStatus
  openingFloat: number
  expectedCash?: number
  countedCash?: number
  variance?: number
  notes?: string
  openedAt: string
  closedAt?: string
  openedBy?: { id: string; firstName: string; lastName: string }
  closedBy?: { id: string; firstName: string; lastName: string }
}

// Tax types
export type TaxCategory =
  | 'RENT'
  | 'SALARIES'
  | 'UTILITIES'
  | 'MARKETING'
  | 'TRANSPORT'
  | 'PROFESSIONAL_FEES'
  | 'LOAN_INTEREST'
  | 'CAPITAL_ASSETS'
  | 'NON_DEDUCTIBLE'
  | 'UNCATEGORIZED'

export const TAX_CATEGORY_LABELS: Record<TaxCategory, string> = {
  RENT: 'Rent',
  SALARIES: 'Salaries & Wages',
  UTILITIES: 'Utilities',
  MARKETING: 'Marketing & Advertising',
  TRANSPORT: 'Transport & Travel',
  PROFESSIONAL_FEES: 'Professional Fees',
  LOAN_INTEREST: 'Loan Interest',
  CAPITAL_ASSETS: 'Capital Assets',
  NON_DEDUCTIBLE: 'Non-Deductible',
  UNCATEGORIZED: 'Uncategorized',
}

export const TAX_CATEGORIES: TaxCategory[] = [
  'RENT', 'SALARIES', 'UTILITIES', 'MARKETING', 'TRANSPORT',
  'PROFESSIONAL_FEES', 'LOAN_INTEREST', 'CAPITAL_ASSETS',
  'NON_DEDUCTIBLE', 'UNCATEGORIZED',
]

export interface TaxReportLog {
  id: string
  organizationId: string
  userId: string
  periodStart: string
  periodEnd: string
  generatedAt: string
  user: { firstName: string; lastName: string; email: string }
}

export interface DeductibleSummary {
  year: number
  total: number
  byCategory: Array<{ category: TaxCategory; label: string; total: number; count: number }>
}

export interface TaxComplianceItem {
  id: string
  label: string
  status: 'ok' | 'warn' | 'error'
  hint: string
}

export interface TaxFilingPreview {
  period: { startDate: string; endDate: string }
  organization: { name: string; email?: string; address?: string } | null
  revenue: {
    totalRevenue: number
    totalCollected: number
    totalOutstanding: number
    vatCollected: number
    invoiceCount: number
    paidInvoiceCount: number
  }
  expenses: {
    deductible: {
      total: number
      byCategory: Array<{ category: TaxCategory; label: string; total: number; count: number }>
    }
    nonDeductible: { total: number; count: number }
  }
  tax: {
    taxableProfit: number
    citStatus: string
    citAmount: number
    vatCollected: number
    vatPaidOnExpenses: number
    netVatLiability: number
  }
  compliance: TaxComplianceItem[]
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
  vendorId?: string
  vendor?: { id: string; name: string }
  paymentMethod: PaymentMethod
  reference?: string
  notes?: string
  taxCategory: TaxCategory
  isDeductible: boolean
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
  income: { total: number; paymentCount: number; change?: number }
  expenses: { total: number; expenseCount: number; change?: number }
  profit: number
  profitChange?: number
  profitMargin: number | string
  cumulativeCash?: number
  runwayMonths?: number | null
  invoices: Record<string, { count: number; total: number }>
  insights?: Array<{
    id: string
    type: 'info' | 'warning' | 'critical'
    title: string
    message: string
  }>
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
    totalAmount?: number
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
    lastMonth: number
    changePct: number
  }
  users: {
    total: number
  }
  revenue: {
    gmv: number
    gmvCurrentMonth: number
    gmvPreviousMonth: number
    gmvChangePct: number
    platformFees: number
    platformFeesCurrentMonth: number
    platformFeesPreviousMonth: number
    platformFeesChangePct: number
  }
  subscriptions: {
    byPlan: { FREE: number; STARTER: number; PRO: number; BUSINESS: number }
    payingByPlan: { FREE: number; STARTER: number; PRO: number; BUSINESS: number }
    byStatus: { TRIALING: number; ACTIVE: number; CANCELLED: number; EXPIRED: number }
    byPlanStatus: Record<string, { TRIALING: number; ACTIVE: number; CANCELLED: number; EXPIRED: number }>
    grandfathered: number
    revenue: number
    revenueCurrentMonth: number
    revenuePreviousMonth: number
    revenueChangePct: number
  }
  health: {
    trialConversionRate: number
    monthlyActiveTenants: number
    monthlyActiveTenantsRate: number
    trialsExpiringThisWeek: number
    trialsExpiringThisMonth: number
    churnedOrgs: number
    collectedGmv: number
    collectedGmvCurrentMonth: number
    collectedGmvPreviousMonth: number
    collectedGmvChangePct: number
    trialsExpiringSoon: Array<{
      id: string
      name: string
      slug: string
      planTier: PlanTier
      trialEndDate: string | null
      daysRemaining: number | null
      userCount: number
      invoiceCount: number
    }>
  }
  invoices: Record<string, { count: number; total: number }>
  recentSignups: Array<{
    id: string
    name: string
    slug: string
    userCount: number
    invoiceCount: number
    createdAt: string
    planTier: PlanTier
    subscriptionStatus: SubscriptionStatus
    isGrandfathered: boolean
    trialEndDate: string | null
  }>
  topOrganizations: Array<{
    id: string
    name: string
    slug: string
    userCount: number
    invoiceCount: number
    volume: number
    createdAt: string
    planTier: PlanTier
    subscriptionStatus: SubscriptionStatus
    isGrandfathered: boolean
  }>
  trends: Array<{
    month: string
    mrr: number
    collectedGmv: number
    payingTenants: number
    trialingTenants: number
  }>
}

export interface PlatformOrganization {
  id: string
  name: string
  slug: string
  email: string | null
  phone: string | null
  planTier: PlanTier
  subscriptionStatus: SubscriptionStatus
  isGrandfathered: boolean
  platformFeePercent: number
  createdAt: string
  userCount: number
  invoiceCount: number
  trialStartDate: string | null
  trialEndDate: string | null
  subscriptionStartDate: string | null
  daysInTrial: number | null
  trialDaysRemaining: number | null
  lastInvoiceAt: string | null
}

export interface PlatformOrganizationsResponse {
  items: PlatformOrganization[]
  meta: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
}

export interface PendingVendorPayout {
  id: string
  name: string
  bankName: string | null
  bankAccountNumber: string | null
  paystackSubaccountCode: string | null
  paystackSubaccountStatus: PaystackSubaccountStatus
  createdAt: string
  organization: {
    id: string
    name: string
    slug: string
  }
}

export interface PlatformOrganizationDetails extends PlatformOrganization {
  clientCount: number
  paymentCount: number
  totalGmv: number
  totalPayments: number
  users: Array<{
    id: string
    email: string
    firstName: string
    lastName: string
    role: string
    isActive: boolean
    createdAt: string
  }>
}

