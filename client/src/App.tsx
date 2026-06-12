import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AppLayout } from '@/components/layout'
import { ProtectedRoute, GuestRoute, PlanGatedRoute } from '@/components/shared'
import { useAuthStore } from '@/stores/auth'
import {
  LoginPage,
  RegisterPage,
  CheckEmailPage,
  VerifyEmailPage,
  SetPasswordPage,
  ForgotPasswordPage,
  ResetPasswordPage,
  GoogleCallbackPage,
  DashboardPage,
  ClientsListPage,
  ClientDetailPage,
  NewClientPage,
  EditClientPage,
  VendorsListPage,
  VendorDetailPage,
  NewVendorPage,
  EditVendorPage,
  InvoicesListPage,
  InvoiceDetailPage,
  NewInvoicePage,
  PaymentsListPage,
  EditPaymentPage,
  ExpensesListPage,
  NewExpensePage,
  EditExpensePage,
  BulkRecategorizePage,
  TaxFilingPackPage,
  ReportsPage,
  InventoryPage,
  SettingsPage,
  UsersPage,
  PaystackPage,
  CategoriesPage,
  ServiceItemsPage,
  OrganizationPage,
  PaymentCallbackPage,
  PublicInvoicePage,
  AdminDashboardPage,
  BillingPage,
} from '@/pages'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
})

function HomeRedirect() {
  const { isAuthenticated, _hasHydrated } = useAuthStore()

  if (!_hasHydrated) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  if (import.meta.env.DEV) {
    window.location.replace(`http://${window.location.hostname}:4321`)
    return null
  }

  const landingUrl = 'https://www.tari1.app'
  window.location.replace(landingUrl)
  return null
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Guest-only routes (redirect to dashboard if already logged in) */}
          <Route element={<GuestRoute />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>
          <Route path="/check-email" element={<CheckEmailPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/set-password" element={<SetPasswordPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/auth/google/callback" element={<GoogleCallbackPage />} />
          <Route path="/payment/callback" element={<PaymentCallbackPage />} />
          <Route path="/i/:token" element={<PublicInvoicePage />} />

          {/* Protected routes */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              {/* Plan-gated routes (PRO+) */}
              <Route element={<PlanGatedRoute requiredPlan="PRO" />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/vendors" element={<VendorsListPage />} />
                <Route path="/vendors/:id" element={<VendorDetailPage />} />
                <Route path="/expenses" element={<ExpensesListPage />} />
                <Route path="/expenses/new" element={<NewExpensePage />} />
                <Route path="/expenses/bulk-recategorize" element={<BulkRecategorizePage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="/tax" element={<TaxFilingPackPage />} />
              </Route>

              {/* Clients (available to all plans) */}
              <Route path="/clients" element={<ClientsListPage />} />
              <Route path="/clients/new" element={<NewClientPage />} />
              <Route path="/clients/:id" element={<ClientDetailPage />} />
              <Route path="/clients/:id/edit" element={<EditClientPage />} />

              {/* Vendor create - SUPER_ADMIN and ADMIN + PRO plan */}
              <Route element={<PlanGatedRoute requiredPlan="PRO" />}>
                <Route element={<ProtectedRoute allowedRoles={['SUPER_ADMIN', 'ADMIN']} />}>
                  <Route path="/vendors/new" element={<NewVendorPage />} />
                </Route>
                <Route element={<ProtectedRoute allowedRoles={['SUPER_ADMIN']} />}>
                  <Route path="/vendors/:id/edit" element={<EditVendorPage />} />
                </Route>
              </Route>

              {/* Invoices (available to all plans) */}
              <Route path="/invoices" element={<InvoicesListPage />} />
              <Route path="/invoices/new" element={<NewInvoicePage />} />
              <Route path="/invoices/:id" element={<InvoiceDetailPage />} />

              {/* Payments (available to all plans) */}
              <Route path="/payments" element={<PaymentsListPage />} />

              {/* Super Admin only */}
              <Route element={<ProtectedRoute allowedRoles={['SUPER_ADMIN']} />}>
                <Route path="/payments/:id/edit" element={<EditPaymentPage />} />
              </Route>

              <Route element={<PlanGatedRoute requiredPlan="PRO" />}>
                <Route element={<ProtectedRoute allowedRoles={['SUPER_ADMIN']} />}>
                  <Route path="/expenses/:id/edit" element={<EditExpensePage />} />
                </Route>
              </Route>

              {/* Inventory */}
              <Route element={<PlanGatedRoute requiredPlan="PRO" />}>
                <Route path="/inventory" element={<InventoryPage />} />
              </Route>


              {/* Platform Admin */}
              <Route path="/admin" element={<AdminDashboardPage />} />

              {/* Settings */}
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/settings/organization" element={<OrganizationPage />} />
              <Route path="/settings/users" element={<UsersPage />} />
              <Route path="/settings/billing" element={<BillingPage />} />
              <Route path="/settings/paystack" element={<PaystackPage />} />
              <Route path="/settings/categories" element={<CategoriesPage />} />
              <Route path="/settings/services" element={<ServiceItemsPage />} />
            </Route>
          </Route>

          {/* Default redirect */}
          <Route path="/" element={<HomeRedirect />} />
          <Route path="*" element={<Navigate to="/invoices" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="bottom-right" richColors />
    </QueryClientProvider>
  )
}

export default App
