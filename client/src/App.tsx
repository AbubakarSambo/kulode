import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AppLayout } from '@/components/layout'
import { ProtectedRoute, GuestRoute } from '@/components/shared'
import {
  LoginPage,
  RegisterPage,
  CheckEmailPage,
  VerifyEmailPage,
  SetPasswordPage,
  ForgotPasswordPage,
  ResetPasswordPage,
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
} from '@/pages'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
})

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
          <Route path="/payment/callback" element={<PaymentCallbackPage />} />
          <Route path="/i/:token" element={<PublicInvoicePage />} />

          {/* Protected routes */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              {/* Dashboard */}
              <Route path="/dashboard" element={<DashboardPage />} />
              
              {/* Clients */}
              <Route path="/clients" element={<ClientsListPage />} />
              <Route path="/clients/new" element={<NewClientPage />} />
              <Route path="/clients/:id" element={<ClientDetailPage />} />
              <Route path="/clients/:id/edit" element={<EditClientPage />} />
              
              {/* Vendors */}
              <Route path="/vendors" element={<VendorsListPage />} />
              <Route path="/vendors/:id" element={<VendorDetailPage />} />

              {/* Vendor create - SUPER_ADMIN and ADMIN */}
              <Route element={<ProtectedRoute allowedRoles={['SUPER_ADMIN', 'ADMIN']} />}>
                <Route path="/vendors/new" element={<NewVendorPage />} />
              </Route>

              {/* Vendor edit - SUPER_ADMIN only */}
              <Route element={<ProtectedRoute allowedRoles={['SUPER_ADMIN']} />}>
                <Route path="/vendors/:id/edit" element={<EditVendorPage />} />
              </Route>

              {/* Invoices */}
              <Route path="/invoices" element={<InvoicesListPage />} />
              <Route path="/invoices/new" element={<NewInvoicePage />} />
              <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
              
              {/* Payments */}
              <Route path="/payments" element={<PaymentsListPage />} />

              {/* Expenses */}
              <Route path="/expenses" element={<ExpensesListPage />} />
              <Route path="/expenses/new" element={<NewExpensePage />} />

              {/* Super Admin only */}
              <Route element={<ProtectedRoute allowedRoles={['SUPER_ADMIN']} />}>
                <Route path="/payments/:id/edit" element={<EditPaymentPage />} />
                <Route path="/expenses/:id/edit" element={<EditExpensePage />} />
              </Route>
              
              {/* Inventory */}
              <Route path="/inventory" element={<InventoryPage />} />

              {/* Reports */}
              <Route path="/reports" element={<ReportsPage />} />
              
              {/* Platform Admin */}
              <Route path="/admin" element={<AdminDashboardPage />} />

              {/* Settings */}
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/settings/organization" element={<OrganizationPage />} />
              <Route path="/settings/users" element={<UsersPage />} />
              <Route path="/settings/paystack" element={<PaystackPage />} />
              <Route path="/settings/categories" element={<CategoriesPage />} />
              <Route path="/settings/services" element={<ServiceItemsPage />} />
            </Route>
          </Route>

          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="bottom-right" richColors />
    </QueryClientProvider>
  )
}

export default App
