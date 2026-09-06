import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AppLayout } from '@/components/layout'
import { ProtectedRoute, GuestRoute, PlanGatedRoute, ReadOnlyGatedRoute, ModuleGatedRoute } from '@/components/shared'


import { useAuthStore } from '@/stores/auth'
import { getPostAuthRoute } from '@/lib/authRouting'
import {
  LoginPage,
  RegisterPage,
  CheckEmailPage,
  VerifyEmailPage,
  SetPasswordPage,
  ForgotPasswordPage,
  ResetPasswordPage,
  GoogleCallbackPage,
  PinLoginPage,
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
  InsightsPage,
  AiChatPage,
  InventoryPage,
  SettingsPage,
  UsersPage,
  PaystackPage,
  CategoriesPage,
  ServiceItemsPage,
  OrganizationPage,
  DirectorsPage,
  PaymentCallbackPage,
  PublicInvoicePage,
  ShortLinkRedirectPage,
  AdminDashboardPage,
  BillingPage,
  ChangelogPage,
  MenuManagementPage,
  MenuItemDetailPage,
  PosDashboardPage,
  MenuCategoriesPage,
  OrderTypesPage,
  PaymentTypesPage,
  WaitersPage,
  WaiterDetailPage,
  TablesFloorPage,
  OrderTakingPage,
  OrderDetailPage,
  OrdersListPage,
  ShiftPage,
  CustomersListPage,
  CustomerDetailPage,
  KitchenTicketsPage,
  DrinksTicketsPage,
  PosReportsPage,
  PrintersPage,
} from '@/pages'
import { useVersionCheck } from '@/hooks/useVersionCheck'
import { WhatsNewModal } from '@/components/changelog/WhatsNewModal'
import { ReloadBanner } from '@/components/changelog/ReloadBanner'

import { queryClient } from '@/lib/queryClient'

function HomeRedirect() {
  const { isAuthenticated, _hasHydrated, user } = useAuthStore()

  if (!_hasHydrated) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (isAuthenticated) {
    return <Navigate to={getPostAuthRoute(user)} replace />
  }

  if (import.meta.env.DEV) {
    window.location.replace(`http://${window.location.hostname}:4321`)
    return null
  }

  const landingUrl = 'https://tarione.com'
  window.location.replace(landingUrl)
  return null
}

function AppVersionManager() {
  const { serverVersion, isUpdateAvailable, lastSeenVersion, setLastSeenVersion } = useVersionCheck()

  const isModalOpen = isUpdateAvailable && lastSeenVersion !== serverVersion

  const handleCloseModal = () => {
    setLastSeenVersion(serverVersion)
  }

  return (
    <>
      <ReloadBanner isVisible={isUpdateAvailable} latestVersion={serverVersion} />
      <WhatsNewModal isOpen={isModalOpen} onClose={handleCloseModal} version={serverVersion} />
    </>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppVersionManager />
      <BrowserRouter>
        <Routes>
          {/* Guest-only routes (redirect to dashboard if already logged in) */}
          <Route element={<GuestRoute />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>
          {/* Not under GuestRoute: "Switch User" navigates here while STILL authenticated (see
              useSwitchUser) so ProtectedRoute never gets a chance to redirect to /login first —
              PinLoginPage clears the outgoing session itself once it has actually mounted. */}
          <Route path="/pin" element={<PinLoginPage />} />
          <Route path="/check-email" element={<CheckEmailPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/set-password" element={<SetPasswordPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/auth/google/callback" element={<GoogleCallbackPage />} />
          <Route path="/payment/callback" element={<PaymentCallbackPage />} />
          <Route path="/i/:token" element={<PublicInvoicePage />} />
          <Route path="/p/:slug" element={<ShortLinkRedirectPage />} />

          {/* Protected routes */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              {/* Plan-gated routes (PRO+) */}
              <Route element={<PlanGatedRoute requiredPlan="PRO" />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/vendors" element={<VendorsListPage />} />
                <Route path="/vendors/:id" element={<VendorDetailPage />} />
                <Route path="/expenses" element={<ExpensesListPage />} />
                <Route element={<ReadOnlyGatedRoute redirectTo="/expenses" />}>
                  <Route path="/expenses/new" element={<NewExpensePage />} />
                  <Route path="/expenses/bulk-recategorize" element={<BulkRecategorizePage />} />
                </Route>
                <Route path="/insights" element={<InsightsPage />} />
                <Route element={<ModuleGatedRoute requiredModule="INVOICING" redirectTo="/pos/order/new" />}>
                  <Route path="/reports" element={<ReportsPage />} />
                  <Route path="/tax" element={<TaxFilingPackPage />} />
                  <Route path="/ai-chat" element={<AiChatPage />} />
                </Route>
              </Route>

              {/* Clients (invoicing-only) */}
              <Route element={<ModuleGatedRoute requiredModule="INVOICING" redirectTo="/pos/order/new" />}>
                <Route path="/clients" element={<ClientsListPage />} />
                <Route element={<ReadOnlyGatedRoute redirectTo="/clients" />}>
                  <Route path="/clients/new" element={<NewClientPage />} />
                  <Route path="/clients/:id/edit" element={<EditClientPage />} />
                </Route>
                <Route path="/clients/:id" element={<ClientDetailPage />} />
              </Route>

              {/* Vendor create - SUPER_ADMIN and ADMIN + PRO plan */}
              <Route element={<PlanGatedRoute requiredPlan="PRO" />}>
                <Route element={<ReadOnlyGatedRoute redirectTo="/vendors" />}>
                  <Route element={<ProtectedRoute allowedRoles={['SUPER_ADMIN', 'ADMIN']} />}>
                    <Route path="/vendors/new" element={<NewVendorPage />} />
                  </Route>
                  <Route element={<ProtectedRoute allowedRoles={['SUPER_ADMIN']} />}>
                    <Route path="/vendors/:id/edit" element={<EditVendorPage />} />
                  </Route>
                </Route>
              </Route>

              {/* Invoices (invoicing-only) */}
              <Route element={<ModuleGatedRoute requiredModule="INVOICING" redirectTo="/pos/order/new" />}>
                <Route path="/invoices" element={<InvoicesListPage />} />
                <Route element={<ReadOnlyGatedRoute redirectTo="/invoices" />}>
                  <Route path="/invoices/new" element={<NewInvoicePage />} />
                </Route>
                <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
              </Route>

              {/* Payments (available to all plans, invoicing-only) */}
              <Route element={<ModuleGatedRoute requiredModule="INVOICING" redirectTo="/pos/order/new" />}>
                <Route path="/payments" element={<PaymentsListPage />} />
              </Route>

              {/* Super Admin only */}
              <Route element={<ReadOnlyGatedRoute redirectTo="/payments" />}>
                <Route element={<ProtectedRoute allowedRoles={['SUPER_ADMIN']} />}>
                  <Route path="/payments/:id/edit" element={<EditPaymentPage />} />
                </Route>
              </Route>

              <Route element={<PlanGatedRoute requiredPlan="PRO" />}>
                <Route element={<ReadOnlyGatedRoute redirectTo="/expenses" />}>
                  <Route element={<ProtectedRoute allowedRoles={['SUPER_ADMIN']} />}>
                    <Route path="/expenses/:id/edit" element={<EditExpensePage />} />
                  </Route>
                </Route>
              </Route>

              {/* Inventory (invoicing-only) */}
              <Route element={<PlanGatedRoute requiredPlan="PRO" />}>
                <Route element={<ModuleGatedRoute requiredModule="INVOICING" redirectTo="/pos/order/new" />}>
                  <Route path="/inventory" element={<InventoryPage />} />
                </Route>
              </Route>

              {/* Restaurant POS (POS-only) */}
              <Route element={<ModuleGatedRoute requiredModule="POS" redirectTo="/invoices" />}>
                <Route path="/pos/dashboard" element={<PosDashboardPage />} />
                <Route path="/pos/menu" element={<MenuManagementPage />} />
                <Route path="/pos/menu/:id" element={<MenuItemDetailPage />} />
                <Route path="/pos/categories" element={<MenuCategoriesPage />} />
                <Route path="/pos/order-types" element={<OrderTypesPage />} />
                <Route path="/pos/payment-types" element={<PaymentTypesPage />} />
                <Route path="/pos/waiters" element={<WaitersPage />} />
                <Route path="/pos/waiters/:id" element={<WaiterDetailPage />} />
                <Route path="/pos/tables" element={<TablesFloorPage />} />
                <Route path="/pos/order/new" element={<OrderTakingPage />} />
                <Route path="/pos/orders" element={<OrdersListPage />} />
                <Route path="/pos/orders/:id" element={<OrderDetailPage />} />
                <Route path="/pos/shift" element={<ShiftPage />} />
                <Route path="/pos/customers" element={<CustomersListPage />} />
                <Route path="/pos/customers/:id" element={<CustomerDetailPage />} />
                <Route
                  element={
                    <ProtectedRoute
                      allowedRoles={['PASS', 'RUNNER', 'MANAGER', 'SUPERVISOR', 'ADMIN', 'SUPER_ADMIN']}
                    />
                  }
                >
                  <Route path="/pos/kitchen" element={<KitchenTicketsPage />} />
                  <Route path="/pos/drinks" element={<DrinksTicketsPage />} />
                </Route>
                <Route path="/pos/reports" element={<PosReportsPage />} />
              </Route>


              {/* Platform Admin */}
              <Route path="/admin" element={<AdminDashboardPage />} />

              {/* Settings */}
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/settings/organization" element={<OrganizationPage />} />
              <Route path="/settings/directors" element={<DirectorsPage />} />
              <Route element={<ProtectedRoute allowedRoles={['SUPER_ADMIN', 'ADMIN']} />}>
                <Route path="/settings/users" element={<UsersPage />} />
              </Route>
              <Route path="/settings/billing" element={<BillingPage />} />
              <Route path="/settings/paystack" element={<PaystackPage />} />
              <Route path="/settings/categories" element={<CategoriesPage />} />
              <Route path="/settings/services" element={<ServiceItemsPage />} />
              <Route element={<ProtectedRoute allowedRoles={['SUPER_ADMIN', 'ADMIN']} />}>
                <Route path="/settings/printers" element={<PrintersPage />} />
              </Route>
              <Route path="/settings/changelog" element={<ChangelogPage />} />
            </Route>
          </Route>

          {/* Default redirect */}
          <Route path="/" element={<HomeRedirect />} />
          <Route path="*" element={<Navigate to="/invoices" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="bottom-right" richColors duration={2500} />
    </QueryClientProvider>
  )
}

export default App
