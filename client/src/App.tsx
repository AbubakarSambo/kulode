import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AppLayout } from '@/components/layout'
import { ProtectedRoute, GuestRoute, PlanGatedRoute, ReadOnlyGatedRoute, ModuleGatedRoute, ErrorBoundary } from '@/components/shared'


import { useAuthStore } from '@/stores/auth'
import { getPostAuthRoute } from '@/lib/authRouting'
import { useVersionCheck } from '@/hooks/useVersionCheck'
import { WhatsNewModal } from '@/components/changelog/WhatsNewModal'
import { ReloadBanner } from '@/components/changelog/ReloadBanner'
import { queryClient } from '@/lib/queryClient'
// Each page is its own dynamic import (not re-exported from the '@/pages' barrel) so Vite can
// code-split it into its own chunk — importing from the barrel here would drag every page's
// module into whichever chunk touches it first, since a barrel module must be fully evaluated
// top-to-bottom before any one of its named exports is usable. See the (now-fixed) latency
// investigation: the whole app was shipping as a single ~2.2MB bundle, downloaded and parsed in
// full on every route.
const LoginPage = lazy(() => import('@/pages/auth/Login').then((m) => ({ default: m.LoginPage })))
const RegisterPage = lazy(() => import('@/pages/auth/Register').then((m) => ({ default: m.RegisterPage })))
const CheckEmailPage = lazy(() => import('@/pages/auth/CheckEmail').then((m) => ({ default: m.CheckEmailPage })))
const VerifyEmailPage = lazy(() => import('@/pages/auth/VerifyEmail').then((m) => ({ default: m.VerifyEmailPage })))
const SetPasswordPage = lazy(() => import('@/pages/auth/SetPassword').then((m) => ({ default: m.SetPasswordPage })))
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPassword').then((m) => ({ default: m.ForgotPasswordPage })))
const ResetPasswordPage = lazy(() => import('@/pages/auth/ResetPassword').then((m) => ({ default: m.ResetPasswordPage })))
const GoogleCallbackPage = lazy(() => import('@/pages/auth/GoogleCallback').then((m) => ({ default: m.GoogleCallbackPage })))
const PinLoginPage = lazy(() => import('@/pages/auth/PinLogin').then((m) => ({ default: m.PinLoginPage })))
const DashboardPage = lazy(() => import('@/pages/dashboard/Dashboard').then((m) => ({ default: m.DashboardPage })))
const ClientsListPage = lazy(() => import('@/pages/clients/ClientsList').then((m) => ({ default: m.ClientsListPage })))
const ClientDetailPage = lazy(() => import('@/pages/clients/ClientDetail').then((m) => ({ default: m.ClientDetailPage })))
const NewClientPage = lazy(() => import('@/pages/clients/ClientForm').then((m) => ({ default: m.NewClientPage })))
const EditClientPage = lazy(() => import('@/pages/clients/ClientForm').then((m) => ({ default: m.EditClientPage })))
const VendorsListPage = lazy(() => import('@/pages/vendors/VendorsList').then((m) => ({ default: m.VendorsListPage })))
const VendorDetailPage = lazy(() => import('@/pages/vendors/VendorDetail').then((m) => ({ default: m.VendorDetailPage })))
const NewVendorPage = lazy(() => import('@/pages/vendors/VendorForm').then((m) => ({ default: m.NewVendorPage })))
const EditVendorPage = lazy(() => import('@/pages/vendors/VendorForm').then((m) => ({ default: m.EditVendorPage })))
const InvoicesListPage = lazy(() => import('@/pages/invoices/InvoicesList').then((m) => ({ default: m.InvoicesListPage })))
const InvoiceDetailPage = lazy(() => import('@/pages/invoices/InvoiceDetail').then((m) => ({ default: m.InvoiceDetailPage })))
const NewInvoicePage = lazy(() => import('@/pages/invoices/InvoiceForm').then((m) => ({ default: m.NewInvoicePage })))
const PaymentsListPage = lazy(() => import('@/pages/payments/PaymentsList').then((m) => ({ default: m.PaymentsListPage })))
const EditPaymentPage = lazy(() => import('@/pages/payments/PaymentForm').then((m) => ({ default: m.EditPaymentPage })))
const ExpensesListPage = lazy(() => import('@/pages/expenses/ExpensesList').then((m) => ({ default: m.ExpensesListPage })))
const NewExpensePage = lazy(() => import('@/pages/expenses/ExpenseForm').then((m) => ({ default: m.NewExpensePage })))
const EditExpensePage = lazy(() => import('@/pages/expenses/ExpenseForm').then((m) => ({ default: m.EditExpensePage })))
const BulkRecategorizePage = lazy(() => import('@/pages/expenses/BulkRecategorize').then((m) => ({ default: m.BulkRecategorizePage })))
const TaxFilingPackPage = lazy(() => import('@/pages/tax/TaxFilingPack').then((m) => ({ default: m.TaxFilingPackPage })))
const ReportsPage = lazy(() => import('@/pages/reports/Reports').then((m) => ({ default: m.ReportsPage })))
const InsightsPage = lazy(() => import('@/pages/insights/InsightsPage').then((m) => ({ default: m.InsightsPage })))
const AiChatPage = lazy(() => import('@/pages/ai-chat/AiChatPage').then((m) => ({ default: m.AiChatPage })))
const InventoryPage = lazy(() => import('@/pages/inventory/InventoryPage').then((m) => ({ default: m.InventoryPage })))
const SettingsPage = lazy(() => import('@/pages/settings/Settings').then((m) => ({ default: m.SettingsPage })))
const UsersPage = lazy(() => import('@/pages/settings/UsersPage').then((m) => ({ default: m.UsersPage })))
const PaystackPage = lazy(() => import('@/pages/settings/PaystackPage').then((m) => ({ default: m.PaystackPage })))
const MoniepointPage = lazy(() => import('@/pages/settings/MoniepointPage').then((m) => ({ default: m.MoniepointPage })))
const CategoriesPage = lazy(() => import('@/pages/settings/CategoriesPage').then((m) => ({ default: m.CategoriesPage })))
const ServiceItemsPage = lazy(() => import('@/pages/settings/ServiceItemsPage').then((m) => ({ default: m.ServiceItemsPage })))
const OrganizationPage = lazy(() => import('@/pages/settings/OrganizationPage').then((m) => ({ default: m.OrganizationPage })))
const DirectorsPage = lazy(() => import('@/pages/settings/DirectorsPage').then((m) => ({ default: m.DirectorsPage })))
const PaymentCallbackPage = lazy(() => import('@/pages/payment/PaymentCallback').then((m) => ({ default: m.PaymentCallbackPage })))
const PublicInvoicePage = lazy(() => import('@/pages/invoice/PublicInvoice').then((m) => ({ default: m.PublicInvoicePage })))
const ShortLinkRedirectPage = lazy(() => import('@/pages/invoice/ShortLinkRedirect').then((m) => ({ default: m.ShortLinkRedirectPage })))
const DebugSentryPage = lazy(() => import('@/pages/DebugSentryPage').then((m) => ({ default: m.DebugSentryPage })))
const AdminDashboardPage = lazy(() => import('@/pages/admin/AdminDashboard').then((m) => ({ default: m.AdminDashboardPage })))
const BillingPage = lazy(() => import('@/pages/settings/BillingPage').then((m) => ({ default: m.BillingPage })))
const ChangelogPage = lazy(() => import('@/pages/settings/ChangelogPage').then((m) => ({ default: m.ChangelogPage })))
const MenuManagementPage = lazy(() => import('@/pages/pos/MenuManagementPage').then((m) => ({ default: m.MenuManagementPage })))
const MenuItemDetailPage = lazy(() => import('@/pages/pos/MenuItemDetailPage').then((m) => ({ default: m.MenuItemDetailPage })))
const PosDashboardPage = lazy(() => import('@/pages/pos/PosDashboardPage').then((m) => ({ default: m.PosDashboardPage })))
const MenuCategoriesPage = lazy(() => import('@/pages/pos/MenuCategoriesPage').then((m) => ({ default: m.MenuCategoriesPage })))
const OrderTypesPage = lazy(() => import('@/pages/pos/OrderTypesPage').then((m) => ({ default: m.OrderTypesPage })))
const PaymentTypesPage = lazy(() => import('@/pages/pos/PaymentTypesPage').then((m) => ({ default: m.PaymentTypesPage })))
const WaiterDetailPage = lazy(() => import('@/pages/pos/WaiterDetailPage').then((m) => ({ default: m.WaiterDetailPage })))
const TablesFloorPage = lazy(() => import('@/pages/pos/TablesFloorPage').then((m) => ({ default: m.TablesFloorPage })))
const OrderTakingPage = lazy(() => import('@/pages/pos/OrderTakingPage').then((m) => ({ default: m.OrderTakingPage })))
const OrderDetailPage = lazy(() => import('@/pages/pos/OrderDetailPage').then((m) => ({ default: m.OrderDetailPage })))
const OrdersListPage = lazy(() => import('@/pages/pos/OrdersListPage').then((m) => ({ default: m.OrdersListPage })))
const ShiftPage = lazy(() => import('@/pages/pos/ShiftPage').then((m) => ({ default: m.ShiftPage })))
const CustomersListPage = lazy(() => import('@/pages/pos/CustomersListPage').then((m) => ({ default: m.CustomersListPage })))
const CustomerDetailPage = lazy(() => import('@/pages/pos/CustomerDetailPage').then((m) => ({ default: m.CustomerDetailPage })))
const KitchenTicketsPage = lazy(() => import('@/pages/kitchen/KitchenTicketsPage').then((m) => ({ default: m.KitchenTicketsPage })))
const DrinksTicketsPage = lazy(() => import('@/pages/kitchen/DrinksTicketsPage').then((m) => ({ default: m.DrinksTicketsPage })))
const PosReportsPage = lazy(() => import('@/pages/pos/PosReportsPage').then((m) => ({ default: m.PosReportsPage })))
const PosAiChatPage = lazy(() => import('@/pages/pos/PosAiChatPage').then((m) => ({ default: m.PosAiChatPage })))
const PrintersPage = lazy(() => import('@/pages/settings/PrintersPage').then((m) => ({ default: m.PrintersPage })))

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
    <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AppVersionManager />
      <BrowserRouter>
        <Suspense
          fallback={
            <div className="flex h-screen items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          }
        >
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
          <Route path="/debug-sentry" element={<DebugSentryPage />} />

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

              {/* Inventory — available to POS-only and invoicing-only orgs alike, since it backs
                  POS menu-item recipes (stock deduction on order-item SERVED) as well as invoices */}
              <Route element={<PlanGatedRoute requiredPlan="PRO" />}>
                <Route path="/inventory" element={<InventoryPage />} />
              </Route>

              {/* Restaurant POS (POS-only) */}
              <Route element={<ModuleGatedRoute requiredModule="POS" redirectTo="/invoices" />}>
                <Route path="/pos/dashboard" element={<PosDashboardPage />} />
                <Route path="/pos/menu" element={<MenuManagementPage />} />
                <Route path="/pos/menu/:id" element={<MenuItemDetailPage />} />
                <Route path="/pos/categories" element={<MenuCategoriesPage />} />
                <Route path="/pos/order-types" element={<OrderTypesPage />} />
                <Route path="/pos/payment-types" element={<PaymentTypesPage />} />
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
                      allowedRoles={['PASS', 'RUNNER', 'KITCHEN', 'MANAGER', 'SUPERVISOR', 'ADMIN', 'SUPER_ADMIN']}
                    />
                  }
                >
                  <Route path="/pos/kitchen" element={<KitchenTicketsPage />} />
                  <Route path="/pos/drinks" element={<DrinksTicketsPage />} />
                </Route>
                <Route path="/pos/reports" element={<PosReportsPage />} />
                <Route element={<PlanGatedRoute requiredPlan="PRO" />}>
                  <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'SUPER_ADMIN']} />}>
                    <Route path="/pos/ai-chat" element={<PosAiChatPage />} />
                  </Route>
                </Route>
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
                <Route path="/settings/moniepoint" element={<MoniepointPage />} />
              </Route>
              <Route path="/settings/changelog" element={<ChangelogPage />} />
            </Route>
          </Route>

          {/* Default redirect */}
          <Route path="/" element={<HomeRedirect />} />
          <Route path="*" element={<Navigate to="/invoices" replace />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
      <Toaster position="bottom-right" richColors duration={2500} />
    </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App
