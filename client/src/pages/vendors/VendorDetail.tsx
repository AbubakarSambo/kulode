import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Edit, Trash2, Mail, Phone, User, Building2, CreditCard, FileText } from 'lucide-react'
import { Header } from '@/components/layout'
import { Button, Card, CardContent, CardHeader, CardTitle, Badge } from '@/components/ui'
import { vendorsApi, expensesApi } from '@/api'
import { formatDate, formatCurrency } from '@/lib/utils'
import { posthog } from '@/lib/posthog'
import { useAuthStore } from '@/stores/auth'

export function VendorDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)

  const isSuperAdmin = user?.role === 'SUPER_ADMIN'

  const { data: vendor, isLoading } = useQuery({
    queryKey: ['vendors', id],
    queryFn: () => vendorsApi.get(id!),
    enabled: !!id,
  })

  const { data: expensesPage } = useQuery({
    queryKey: ['expenses', { vendorId: id }],
    queryFn: () => expensesApi.list({ vendorId: id!, limit: 100 }),
    enabled: !!id,
  })

  const expenses = expensesPage?.data ?? []
  const totalSpent = expenses.reduce((sum, e) => sum + Number(e.amount), 0)

  const deleteMutation = useMutation({
    mutationFn: () => vendorsApi.delete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] })
      posthog.capture('vendor_deleted', { vendor_id: id })
      toast.success('Vendor deleted')
      navigate('/vendors')
    },
    onError: (error: any) => {
      toast.error('Failed to delete vendor', {
        description: error.response?.data?.message,
      })
    },
  })

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this vendor?')) {
      deleteMutation.mutate()
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!vendor) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center">
        <p className="text-muted-foreground">Vendor not found</p>
        <Button className="mt-4" onClick={() => navigate('/vendors')}>
          Back to Vendors
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title={vendor.name}
        description={vendor.isActive ? 'Active vendor' : 'Inactive vendor'}
        action={
          isSuperAdmin ? (
            <div className="flex gap-2">
              <Link to={`/vendors/${vendor.id}/edit`}>
                <Button variant="outline">
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </Button>
              </Link>
              <Button variant="outline" onClick={handleDelete}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Service Description */}
          {vendor.serviceDescription && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Service Description
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{vendor.serviceDescription}</p>
              </CardContent>
            </Card>
          )}

          {/* Contact Info */}
          <Card>
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {vendor.contactPerson && (
                <div className="flex items-center gap-3">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{vendor.contactPerson}</span>
                </div>
              )}
              {vendor.email && (
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <a href={`mailto:${vendor.email}`} className="text-primary hover:underline">
                    {vendor.email}
                  </a>
                </div>
              )}
              {vendor.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <a href={`tel:${vendor.phone}`} className="hover:underline">
                    {vendor.phone}
                  </a>
                </div>
              )}
              {!vendor.contactPerson && !vendor.email && !vendor.phone && (
                <p className="text-sm text-muted-foreground">No contact information</p>
              )}
            </CardContent>
          </Card>

          {/* Bank Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Bank Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {vendor.bankName && (
                <div>
                  <p className="text-sm text-muted-foreground">Bank Name</p>
                  <p className="font-medium">{vendor.bankName}</p>
                </div>
              )}
              {vendor.bankAccountNumber && (
                <div>
                  <p className="text-sm text-muted-foreground">Account Number</p>
                  <p className="font-medium">{vendor.bankAccountNumber}</p>
                </div>
              )}
              {!vendor.bankName && !vendor.bankAccountNumber && (
                <p className="text-sm text-muted-foreground">No bank details</p>
              )}
            </CardContent>
          </Card>

          {/* Meta */}
          <Card className="lg:col-span-2">
            <CardContent className="flex items-center gap-6 p-4">
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge variant={vendor.isActive ? 'default' : 'secondary'}>
                  {vendor.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Added</p>
                <p className="text-sm font-medium">{formatDate(vendor.createdAt)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Spent</p>
                <p className="text-sm font-medium">{formatCurrency(totalSpent)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Expenses</p>
                <p className="text-sm font-medium">{expenses.length}</p>
              </div>
            </CardContent>
          </Card>

          {/* Expenses */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Expenses
              </CardTitle>
            </CardHeader>
            <CardContent>
              {expenses.length === 0 ? (
                <p className="text-sm text-muted-foreground">No expenses recorded for this vendor yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 pr-4 font-medium">Date</th>
                        <th className="pb-2 pr-4 font-medium">Description</th>
                        <th className="pb-2 pr-4 font-medium">Category</th>
                        <th className="pb-2 pr-4 font-medium">Method</th>
                        <th className="pb-2 text-right font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenses.map((expense) => (
                        <tr key={expense.id} className="border-b last:border-0">
                          <td className="py-2 pr-4 text-muted-foreground">{formatDate(expense.expenseDate)}</td>
                          <td className="py-2 pr-4">{expense.description}</td>
                          <td className="py-2 pr-4 text-muted-foreground">{expense.category?.name ?? '—'}</td>
                          <td className="py-2 pr-4 text-muted-foreground">{expense.paymentMethod.replace('_', ' ')}</td>
                          <td className="py-2 text-right font-medium">{formatCurrency(Number(expense.amount))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
