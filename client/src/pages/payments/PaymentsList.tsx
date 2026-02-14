import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { Header } from '@/components/layout'
import { Button, Card, CardContent, Badge } from '@/components/ui'
import { paymentsApi } from '@/api'
import { formatCurrency, formatDate } from '@/lib/utils'

export function PaymentsListPage() {
  const [page, setPage] = useState(1)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const handleDownloadReceipt = async (paymentId: string, invoiceNumber: string) => {
    setDownloadingId(paymentId)
    try {
      const blob = await paymentsApi.downloadReceipt(paymentId)
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `receipt-${invoiceNumber}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch {
      toast.error('Failed to download receipt')
    } finally {
      setDownloadingId(null)
    }
  }

  const { data, isLoading } = useQuery({
    queryKey: ['payments', { page }],
    queryFn: () => paymentsApi.list({ page, limit: 20 }),
  })

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="Payments"
        description="View all received payments"
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : data?.data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground">No payments recorded yet</p>
          </div>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left text-sm font-medium">Invoice</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Method</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Date</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Reference</th>
                    <th className="px-4 py-3 text-right text-sm font-medium">Amount</th>
                    <th className="px-4 py-3 text-right text-sm font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {data?.data.map((payment) => (
                    <tr key={payment.id} className="border-b last:border-0 hover:bg-muted/25">
                      <td className="px-4 py-3">
                        <p className="font-medium">{payment.invoice?.invoiceNumber}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={payment.isAutoRecorded ? 'default' : 'secondary'}>
                          {payment.paymentMethod.replace('_', ' ')}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(payment.paymentDate)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {payment.reference ?? '-'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-green-600">
                        +{formatCurrency(payment.amount)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDownloadReceipt(payment.id, payment.invoice?.invoiceNumber || 'unknown')}
                          disabled={downloadingId === payment.id}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pagination */}
        {data && data.meta.totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
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
      </div>
    </div>
  )
}
