import { Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AppLayout } from '@/components/layout'
import { ProtectedRoute, GuestRoute, PlanGatedRoute, ReadOnlyGatedRoute, ModuleGatedRoute, ErrorBoundary } from '@/components/shared'


import { useAuthStore } from '@/stores/auth'
import { usePosMode } from '@/hooks/useOrgModules'
import { getPostAuthRoute } from '@/lib/authRouting'
import { useVersionCheck } from '@/hooks/useVersionCheck'
import { WhatsNewModal } from '@/components/changelog/WhatsNewModal'
import { ReloadBanner } from '@/components/changelog/ReloadBanner'
import { queryClient } from '@/lib/queryClient'
import { lazyPage } from '@/lib/lazyPage'
// Each page is its own dynamic import (not re-exported from the '@/pages' barrel) so Vite can
// code-split it into its own chunk — importing from the barrel here would drag every page's
// module into whichever chunk touches it first, since a barrel module must be fully evaluated
// top-to-bottom before any one of its named exports is usable. See the (now-fixed) latency
// investigation: the whole app was shipping as a single ~2.2MB bundle, downloaded and parsed in
// full on every route.
const LoginPage = lazyPage(() => import('@/pages/auth/Login'), 'LoginPage')
const RegisterPage = lazyPage(() => import('@/pages/auth/Register'), 'RegisterPage')
const CheckEmailPage = lazyPage(() => import('@/pages/auth/CheckEmail'), 'CheckEmailPage')
const VerifyEmailPage = lazyPage(() => import('@/pages/auth/VerifyEmail'), 'VerifyEmailPage')
const SetPasswordPage = lazyPage(() => import('@/pages/auth/SetPassword'), 'SetPasswordPage')
const ForgotPasswordPage = lazyPage(() => import('@/pages/auth/ForgotPassword'), 'ForgotPasswordPage')
const ResetPasswordPage = lazyPage(() => import('@/pages/auth/ResetPassword'), 'ResetPasswordPage')
const GoogleCallbackPage = lazyPage(() => import('@/pages/auth/GoogleCallback'), 'GoogleCallbackPage')
const PinLoginPage = lazyPage(() => import('@/pages/auth/PinLogin'), 'PinLoginPage')
const DashboardPage = lazyPage(() => import('@/pages/dashboard/Dashboard'), 'DashboardPage')
const ClientsListPage = lazyPage(() => import('@/pages/clients/ClientsList'), 'ClientsListPage')
const ClientDetailPage = lazyPage(() => import('@/pages/clients/ClientDetail'), 'ClientDetailPage')
const NewClientPage = lazyPage(() => import('@/pages/clients/ClientForm'), 'NewClientPage')
const EditClientPage = lazyPage(() => import('@/pages/clients/ClientForm'), 'EditClientPage')
const VendorsListPage = lazyPage(() => import('@/pages/vendors/VendorsList'), 'VendorsListPage')
const VendorDetailPage = lazyPage(() => import('@/pages/vendors/VendorDetail'), 'VendorDetailPage')
const NewVendorPage = lazyPage(() => import('@/pages/vendors/VendorForm'), 'NewVendorPage')
const EditVendorPage = lazyPage(() => import('@/pages/vendors/VendorForm'), 'EditVendorPage')
const InvoicesListPage = lazyPage(() => import('@/pages/invoices/InvoicesList'), 'InvoicesListPage')
const InvoiceDetailPage = lazyPage(() => import('@/pages/invoices/InvoiceDetail'), 'InvoiceDetailPage')
const NewInvoicePage = lazyPage(() => import('@/pages/invoices/InvoiceForm'), 'NewInvoicePage')
const PaymentsListPage = lazyPage(() => import('@/pages/payments/PaymentsList'), 'PaymentsListPage')
const EditPaymentPage = lazyPage(() => import('@/pages/payments/PaymentForm'), 'EditPaymentPage')
const ExpensesListPage = lazyPage(() => import('@/pages/expenses/ExpensesList'), 'ExpensesListPage')
const NewExpensePage = lazyPage(() => import('@/pages/expenses/ExpenseForm'), 'NewExpensePage')
const EditExpensePage = lazyPage(() => import('@/pages/expenses/ExpenseForm'), 'EditExpensePage')
const BulkRecategorizePage = lazyPage(() => import('@/pages/expenses/BulkRecategorize'), 'BulkRecategorizePage')
const TaxFilingPackPage = lazyPage(() => import('@/pages/tax/TaxFilingPack'), 'TaxFilingPackPage')
const ReportsPage = lazyPage(() => import('@/pages/reports/Reports'), 'ReportsPage')
const InsightsPage = lazyPage(() => import('@/pages/insights/InsightsPage'), 'InsightsPage')
const AiChatPage = lazyPage(() => import('@/pages/ai-chat/AiChatPage'), 'AiChatPage')
const InventoryPage = lazyPage(() => import('@/pages/inventory/InventoryPage'), 'InventoryPage')
const SettingsPage = lazyPage(() => import('@/pages/settings/Settings'), 'SettingsPage')
const UsersPage = lazyPage(() => import('@/pages/settings/UsersPage'), 'UsersPage')
const PaystackPage = lazyPage(() => import('@/pages/settings/PaystackPage'), 'PaystackPage')
const MoniepointPage = lazyPage(() => import('@/pages/settings/MoniepointPage'), 'MoniepointPage')
const CategoriesPage = lazyPage(() => import('@/pages/settings/CategoriesPage'), 'CategoriesPage')
const ServiceItemsPage = lazyPage(() => import('@/pages/settings/ServiceItemsPage'), 'ServiceItemsPage')
const OrganizationPage = lazyPage(() => import('@/pages/settings/OrganizationPage'), 'OrganizationPage')
const DirectorsPage = lazyPage(() => import('@/pages/settings/DirectorsPage'), 'DirectorsPage')
const PaymentCallbackPage = lazyPage(() => import('@/pages/payment/PaymentCallback'), 'PaymentCallbackPage')
const PublicInvoicePage = lazyPage(() => import('@/pages/invoice/PublicInvoice'), 'PublicInvoicePage')
const ShortLinkRedirectPage = lazyPage(() => import('@/pages/invoice/ShortLinkRedirect'), 'ShortLinkRedirectPage')
const DebugSentryPage = lazyPage(() => import('@/pages/DebugSentryPage'), 'DebugSentryPage')
const AdminDashboardPage = lazyPage(() => import('@/pages/admin/AdminDashboard'), 'AdminDashboardPage')
const BillingPage = lazyPage(() => import('@/pages/settings/BillingPage'), 'BillingPage')
const ChangelogPage = lazyPage(() => import('@/pages/settings/ChangelogPage'), 'ChangelogPage')
const MenuManagementPage = lazyPage(() => import('@/pages/pos/MenuManagementPage'), 'MenuManagementPage')
const MenuItemDetailPage = lazyPage(() => import('@/pages/pos/MenuItemDetailPage'), 'MenuItemDetailPage')
const PosDashboardPage = lazyPage(() => import('@/pages/pos/PosDashboardPage'), 'PosDashboardPage')
const MenuCategoriesPage = lazyPage(() => import('@/pages/pos/MenuCategoriesPage'), 'MenuCategoriesPage')
const OrderTypesPage = lazyPage(() => import('@/pages/pos/OrderTypesPage'), 'OrderTypesPage')
const PaymentTypesPage = lazyPage(() => import('@/pages/pos/PaymentTypesPage'), 'PaymentTypesPage')
const WaiterDetailPage = lazyPage(() => import('@/pages/pos/WaiterDetailPage'), 'WaiterDetailPage')
const TablesFloorPage = lazyPage(() => import('@/pages/pos/TablesFloorPage'), 'TablesFloorPage')
const OrderTakingPage = lazyPage(() => import('@/pages/pos/OrderTakingPage'), 'OrderTakingPage')
const RetailCheckoutPage = lazyPage(() => import('@/pages/pos/RetailCheckoutPage'), 'RetailCheckoutPage')
const OrderDetailPage = lazyPage(() => import('@/pages/pos/OrderDetailPage'), 'OrderDetailPage')
const OrdersListPage = lazyPage(() => import('@/pages/pos/OrdersListPage'), 'OrdersListPage')
const ShiftPage = lazyPage(() => import('@/pages/pos/ShiftPage'), 'ShiftPage')
const CustomersListPage = lazyPage(() => import('@/pages/pos/CustomersListPage'), 'CustomersListPage')
const CustomerDetailPage = lazyPage(() => import('@/pages/pos/CustomerDetailPage'), 'CustomerDetailPage')
const KitchenTicketsPage = lazyPage(() => import('@/pages/kitchen/KitchenTicketsPage'), 'KitchenTicketsPage')
const DrinksTicketsPage = lazyPage(() => import('@/pages/kitchen/DrinksTicketsPage'), 'DrinksTicketsPage')
const PosReportsPage = lazyPage(() => import('@/pages/pos/PosReportsPage'), 'PosReportsPage')
const PosPaymentsPage = lazyPage(() => import('@/pages/pos/PosPaymentsPage'), 'PosPaymentsPage')
const UnreconciledTransfersPage = lazyPage(() => import('@/pages/pos/UnreconciledTransfersPage'), 'UnreconciledTransfersPage')
const PosAiChatPage = lazyPage(() => import('@/pages/pos/PosAiChatPage'), 'PosAiChatPage')
const PrintersPage = lazyPage(() => import('@/pages/settings/PrintersPage'), 'PrintersPage')

// Same URL for both posModes so nav links, role allow-lists (WAITER/CASHIER_ALLOWED_HREFS in
// Sidebar), and deep links to "Sell" keep working unchanged — only which checkout UI renders
// underneath differs.
function PosCheckoutRoute() {
  const { isRetail } = usePosMode()
  return isRetail ? <RetailCheckoutPage /> : <OrderTakingPage />
}

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
                <Route path="/pos/order/new" element={<PosCheckoutRoute />} />
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
                <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'SUPER_ADMIN', 'CASHIER']} />}>
                  <Route path="/pos/payments" element={<PosPaymentsPage />} />
                </Route>
                <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'SUPER_ADMIN', 'SUPERVISOR', 'CASHIER']} />}>
                  <Route path="/pos/unreconciled-transfers" element={<UnreconciledTransfersPage />} />
                </Route>
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
