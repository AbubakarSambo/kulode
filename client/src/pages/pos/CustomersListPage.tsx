import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Plus, Users, Search, Upload } from 'lucide-react'
import { UserGroupIcon } from '@hugeicons/core-free-icons'
import { Header } from '@/components/layout'
import { Button, Input, Label, Card, CardContent, EmptyState } from '@/components/ui'
import { Modal } from '@/components/shared/Modal'
import { CsvImportModal, type CsvColumn } from '@/components/shared/CsvImportModal'
import { customersApi } from '@/api'
import { formatDate } from '@/lib/utils'

const CSV_COLUMNS: CsvColumn[] = [
  { key: 'name', label: 'Name', required: true },
  { key: 'phone', label: 'Phone', required: true },
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
  phone: z.string().min(1, 'Phone is required'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  notes: z.string().optional(),
})
type CustomerFormData = z.infer<typeof customerSchema>

export function CustomersListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const limit = 20

  const { data, isLoading } = useQuery({
    queryKey: ['customers', { search, page }],
    queryFn: () => customersApi.list({ search: search || undefined, page, limit }),
  })

  const form = useForm<CustomerFormData>({ resolver: zodResolver(customerSchema) })

  const createCustomer = useMutation({
    mutationFn: (data: CustomerFormData) =>
      customersApi.create({ ...data, email: data.email || undefined }),
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
                        <td className="px-4 py-3 text-sm text-muted-foreground">{customer.phone}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{customer.email || '—'}</td>
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
                        <div className="text-xs text-muted-foreground">{customer.phone}</div>
                      </div>
                      <span className="rounded-full bg-muted px-2 py-1 text-xs font-semibold text-foreground">
                        {customer._count?.orders ?? 0} orders
                      </span>
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
            <Label>Phone</Label>
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
            phone: row.phone,
            email: row.email || undefined,
            notes: row.notes || undefined,
          })
        }}
        onImported={() => queryClient.invalidateQueries({ queryKey: ['customers'] })}
      />
    </div>
  )
}
