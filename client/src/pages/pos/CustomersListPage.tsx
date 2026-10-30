import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Plus, Users, Search, Upload, AlertTriangle } from 'lucide-react'
import { UserGroupIcon } from '@hugeicons/core-free-icons'
import { Header } from '@/components/layout'
import { Button, Input, Label, Card, CardContent, EmptyState } from '@/components/ui'
import { Modal } from '@/components/shared/Modal'
import { CsvImportModal, type CsvColumn } from '@/components/shared/CsvImportModal'
import { customersApi } from '@/api'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import type { Customer } from '@/types'

const CSV_COLUMNS: CsvColumn[] = [
  { key: 'name', label: 'Name', required: true },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'notes', label: 'Notes' },
]
const CSV_SAMPLE_ROWS = [
  ['Name', 'Phone', 'Email', 'Notes'],
  ['Tunde Bakare', '+234 123 456 7890', 'tunde@example.com', 'Prefers window seating'],
  ['Amaka Obi', '+234 987 654 3210', '', ''],
]

const customerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  notes: z.string().optional(),
})
type CustomerFormData = z.infer<typeof customerSchema>

// Debt in red with how much of the credit limit it uses; a positive balance is prepaid credit.
// Balances arrive as Decimal strings from the API, hence Number().
function WalletBalance({ customer, compact = false }: { customer: Customer; compact?: boolean }) {
  const balance = Number(customer.walletBalance)
  const limit = Number(customer.creditLimit)
  if (!balance) return <span className="text-sm text-muted-foreground">—</span>
  if (balance > 0) return <span className="text-sm font-medium text-foreground">{formatCurrency(balance)}</span>

  const owed = -balance
  return (
    <div className={cn('flex flex-col', compact ? 'items-end' : 'items-start')}>
      <span className="text-sm font-semibold text-destructive">Owes {formatCurrency(owed)}</span>
      {owed > limit ? (
        <span className="text-xs font-medium text-destructive">Over limit{limit > 0 && ` of ${formatCurrency(limit)}`}</span>
      ) : (
        <span className="text-xs text-muted-foreground">of {formatCurrency(limit)} limit</span>
      )}
    </div>
  )
}

export function CustomersListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [owingOnly, setOwingOnly] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const limit = 100

  const { data, isLoading } = useQuery({
    queryKey: ['customers', { search, page, owingOnly }],
    queryFn: () =>
      customersApi.list({ search: search || undefined, page, limit, balance: owingOnly ? 'owing' : undefined }),
  })

  const { data: walletSummary } = useQuery({
    queryKey: ['customers', 'wallet-summary'],
    queryFn: () => customersApi.getWalletSummary(),
  })

  const showOwing = (value: boolean) => {
    setOwingOnly(value)
    setPage(1)
  }

  const form = useForm<CustomerFormData>({ resolver: zodResolver(customerSchema) })

  const createCustomer = useMutation({
    mutationFn: (data: CustomerFormData) =>
      customersApi.create({ ...data, phone: data.phone || undefined, email: data.email || undefined }),
    onSuccess: (customer) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      toast.success('Customer added')
      setCreateOpen(false)
      form.reset()
      navigate(`/pos/customers/${customer.id}`)
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(message || 'Failed to add customer')
    },
  })

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header
        title="Customers"
        description="Diner profiles and their order history"
        icon={Users}
        badgeText={data?.meta.total}
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="mr-1.5 h-4 w-4" /> Import CSV
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> New Customer
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {!!walletSummary?.owingCount && (
          <button
            type="button"
            onClick={() => showOwing(true)}
            className="mb-4 flex w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-left text-sm hover:bg-destructive/10"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
            <span className="font-semibold text-foreground">
              {walletSummary.owingCount} customer{walletSummary.owingCount === 1 ? ' owes' : 's owe'}{' '}
              <span className="text-destructive">{formatCurrency(walletSummary.totalOwed)}</span>
            </span>
            {walletSummary.overLimitCount > 0 && (
              <span className="text-muted-foreground">{walletSummary.overLimitCount} over their credit limit</span>
            )}
            {!owingOnly && <span className="ml-auto text-xs font-medium text-primary">View who's owing →</span>}
          </button>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button size="sm" variant={owingOnly ? 'outline' : 'default'} onClick={() => showOwing(false)} aria-pressed={!owingOnly}>
            All
          </Button>
          <Button size="sm" variant={owingOnly ? 'default' : 'outline'} onClick={() => showOwing(true)} aria-pressed={owingOnly}>
            Owing{walletSummary ? ` (${walletSummary.owingCount})` : ''}
          </Button>
        </div>

        <div className="relative mb-4 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name, phone, email..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : (!data || data.data.length === 0) && (owingOnly || search) ? (
          <EmptyState
            icon={UserGroupIcon}
            title={owingOnly && !search ? 'Nobody owes anything' : 'No matching customers'}
            description={owingOnly && !search ? 'No customer has a negative wallet balance' : 'Try a different search'}
          />
        ) : !data || data.data.length === 0 ? (
          <EmptyState
            icon={UserGroupIcon}
            title="No customers yet"
            description="Add a customer profile to start tracking their order history"
            actionLabel="New Customer"
            onAction={() => setCreateOpen(true)}
          />
        ) : (
          <>
            {/* Desktop table */}
            <Card className="hidden overflow-hidden md:block">
              <CardContent className="p-0">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Phone</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Wallet</th>
                      <th className="px-4 py-3 text-center">Orders</th>
                      <th className="px-4 py-3">Since</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.data.map((customer) => (
                      <tr
                        key={customer.id}
                        onClick={() => navigate(`/pos/customers/${customer.id}`)}
                        className="cursor-pointer hover:bg-muted/40"
                      >
                        <td className="px-4 py-3 font-semibold text-foreground">{customer.name}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{customer.phone || '—'}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{customer.email || '—'}</td>
                        <td className="px-4 py-3">
                          <WalletBalance customer={customer} />
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-medium text-foreground">
                          {customer._count?.orders ?? 0}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(customer.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* Mobile cards */}
            <div className="flex flex-col gap-3 md:hidden">
              {data.data.map((customer) => (
                <Card
                  key={customer.id}
                  onClick={() => navigate(`/pos/customers/${customer.id}`)}
                  className="cursor-pointer p-4"
                >
                  <CardContent className="p-0">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-foreground">{customer.name}</div>
                        <div className="text-xs text-muted-foreground">{customer.phone || '—'}</div>
                      </div>
                      {Number(customer.walletBalance) < 0 ? (
                        <WalletBalance customer={customer} compact />
                      ) : (
                        <span className="rounded-full bg-muted px-2 py-1 text-xs font-semibold text-foreground">
                          {customer._count?.orders ?? 0} orders
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {data.meta.totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground">
                  Page {page} of {data.meta.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === data.meta.totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="New Customer">
        <form onSubmit={form.handleSubmit((data) => createCustomer.mutate(data))} className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input {...form.register('name')} placeholder="e.g. Tunde Bakare" />
          </div>
          <div>
            <Label>Phone (optional)</Label>
            <Input {...form.register('phone')} placeholder="+234 123 456 7890" />
          </div>
          <div>
            <Label>Email (optional)</Label>
            <Input type="email" {...form.register('email')} placeholder="tunde@example.com" />
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Input {...form.register('notes')} placeholder="e.g. Prefers window seating" />
          </div>
          <Button type="submit" className="w-full" isLoading={createCustomer.isPending}>
            Add Customer
          </Button>
        </form>
      </Modal>

      <CsvImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import Customers"
        columns={CSV_COLUMNS}
        sampleFilename="customers-sample.csv"
        sampleRows={CSV_SAMPLE_ROWS}
        onImportRow={async (row) => {
          await customersApi.create({
            name: row.name,
            phone: row.phone || undefined,
            email: row.email || undefined,
            notes: row.notes || undefined,
          })
        }}
        onImported={() => queryClient.invalidateQueries({ queryKey: ['customers'] })}
      />
    </div>
  )
}
