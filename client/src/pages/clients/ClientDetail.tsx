import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  PencilEdit02Icon,
  Delete02Icon,
  PlusSignIcon,
  Mail01Icon,
  Call02Icon,
  Location01Icon,
  Invoice03Icon
} from '@hugeicons/core-free-icons'
import { Header } from '@/components/layout'
import { Button, Card, CardContent, CardHeader, CardTitle, Badge } from '@/components/ui'
import { clientsApi } from '@/api'
import { formatCurrency, formatDate } from '@/lib/utils'
import { posthog } from '@/lib/posthog'
import type { Client, InvoiceStatus } from '@/types'

interface ClientWithInvoices extends Client {
  invoices?: {
    id: string
    invoiceNumber: string
    issueDate: string
    status: InvoiceStatus
    total: number
  }[]
}

const statusColors: Record<InvoiceStatus, 'default' | 'secondary' | 'success' | 'warning' | 'destructive'> = {
  DRAFT: 'secondary',
  SENT: 'default',
  PAID: 'success',
  PARTIALLY_PAID: 'warning',
  OVERDUE: 'destructive',
  CANCELLED: 'secondary',
}

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: client, isLoading } = useQuery<ClientWithInvoices>({
    queryKey: ['clients', id],
    queryFn: () => clientsApi.get(id!) as Promise<ClientWithInvoices>,
    enabled: !!id,
  })

  const deleteMutation = useMutation({
    mutationFn: () => clientsApi.delete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      posthog.capture('client_deleted', { client_id: id })
      toast.success('Client deleted')
      navigate('/clients')
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (error: any) => {
      toast.error('Failed to delete client', {
        description: error.response?.data?.message,
      })
    },
  })

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this client?')) {
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

  if (!client) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center">
        <p className="text-muted-foreground">Client not found</p>
        <Button className="mt-4" onClick={() => navigate('/clients')}>
          Back to Clients
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title={client.name}
        description={client.isActive ? 'Active client' : 'Inactive client'}
        action={
          <div className="flex gap-2">
            <Link to={`/invoices/new?clientId=${client.id}`}>
              <Button>
                <HugeiconsIcon icon={PlusSignIcon} size={16} className="mr-2" strokeWidth={1.5} />
                New Invoice
              </Button>
            </Link>
            <Link to={`/clients/${client.id}/edit`}>
              <Button variant="outline">
                <HugeiconsIcon icon={PencilEdit02Icon} size={16} className="mr-2" strokeWidth={1.5} />
                Edit
              </Button>
            </Link>
            <Button variant="outline" onClick={handleDelete}>
              <HugeiconsIcon icon={Delete02Icon} size={16} className="mr-2" strokeWidth={1.5} />
              Delete
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Client Info */}
          <Card>
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {client.email && (
                <div className="flex items-center gap-3">
                  <HugeiconsIcon icon={Mail01Icon} size={16} className="text-muted-foreground" strokeWidth={1.5} />
                  <a href={`mailto:${client.email}`} className="text-primary hover:underline">
                    {client.email}
                  </a>
                </div>
              )}
              {client.phone && (
                <div className="flex items-center gap-3">
                  <HugeiconsIcon icon={Call02Icon} size={16} className="text-muted-foreground" strokeWidth={1.5} />
                  <a href={`tel:${client.phone}`} className="hover:underline">
                    {client.phone}
                  </a>
                </div>
              )}
              {client.address && (
                <div className="flex items-start gap-3">
                  <HugeiconsIcon icon={Location01Icon} size={16} className="mt-0.5 text-muted-foreground" strokeWidth={1.5} />
                  <span className="text-sm">{client.address}</span>
                </div>
              )}
              {client.notes && (
                <div className="border-t pt-4">
                  <p className="text-sm text-muted-foreground">{client.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Invoices */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <HugeiconsIcon icon={Invoice03Icon} size={20} strokeWidth={1.5} />
                Invoices
              </CardTitle>
              {client.invoices && client.invoices.length > 0 && (() => {
                const outstanding = client.invoices!
                  .filter(inv => inv.status !== 'PAID' && inv.status !== 'CANCELLED')
                  .reduce((sum, inv) => sum + Number(inv.total), 0)
                return outstanding > 0 ? (
                  <div className="text-right">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Outstanding</p>
                    <p className="text-sm font-extrabold text-rose-600">{formatCurrency(outstanding)}</p>
                  </div>
                ) : null
              })()}
            </CardHeader>
            <CardContent>
              {client.invoices && client.invoices.length > 0 ? (
                <div className="space-y-3">
                  {client.invoices.map((invoice) => (
                    <Link
                      key={invoice.id}
                      to={`/invoices/${invoice.id}`}
                      className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
                    >
                      <div>
                        <p className="font-medium">{invoice.invoiceNumber}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(invoice.issueDate)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant={statusColors[invoice.status as InvoiceStatus]}>
                          {invoice.status.replace('_', ' ')}
                        </Badge>
                        <span className="font-medium">{formatCurrency(invoice.total)}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center">
                  <p className="text-muted-foreground">No invoices yet</p>
                  <Link to={`/invoices/new?clientId=${client.id}`}>
                    <Button className="mt-4" variant="outline">
                      Create First Invoice
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
