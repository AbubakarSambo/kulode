import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AppLayout } from '@/components/layout'
import { ProtectedRoute } from '@/components/shared'
import {
  LoginPage,
  RegisterPage,
  DashboardPage,
  ClientsListPage,
  ClientDetailPage,
  NewClientPage,
  InvoicesListPage,
  InvoiceDetailPage,
  NewInvoicePage,
  PaymentsListPage,
  ExpensesListPage,
  NewExpensePage,
  ReportsPage,
  SettingsPage,
  UsersPage,
  PaystackPage,
  CategoriesPage,
  ServiceItemsPage,
  PaymentCallbackPage,
  PublicInvoicePage,
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
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
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
              
              {/* Invoices */}
              <Route path="/invoices" element={<InvoicesListPage />} />
              <Route path="/invoices/new" element={<NewInvoicePage />} />
              <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
              
              {/* Payments */}
              <Route path="/payments" element={<PaymentsListPage />} />
              
              {/* Expenses */}
              <Route path="/expenses" element={<ExpensesListPage />} />
              <Route path="/expenses/new" element={<NewExpensePage />} />
              
              {/* Reports */}
              <Route path="/reports" element={<ReportsPage />} />
              
              {/* Settings */}
              <Route path="/settings" element={<SettingsPage />} />
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
