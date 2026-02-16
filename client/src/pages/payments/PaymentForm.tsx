import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Header } from '@/components/layout'
import { Button, Input, Label, Textarea, Select, Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { paymentsApi } from '@/api'
import type { PaymentMethod } from '@/types'

const paymentSchema = z.object({
  amount: z.number().min(0.01, 'Amount must be greater than 0'),
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'CARD', 'PAYSTACK', 'OTHER']),
  paymentDate: z.string().min(1, 'Date is required'),
  reference: z.string().optional(),
  notes: z.string().optional(),
})

type PaymentFormData = z.infer<typeof paymentSchema>

export function EditPaymentPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: payment, isLoading } = useQuery({
    queryKey: ['payments', id],
    queryFn: () => paymentsApi.get(id!),
    enabled: !!id,
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
  })

  useEffect(() => {
    if (payment) {
      reset({
        amount: payment.amount,
        paymentMethod: payment.paymentMethod,
        paymentDate: new Date(payment.paymentDate).toISOString().split('T')[0],
        reference: payment.reference ?? '',
        notes: payment.notes ?? '',
      })
    }
  }, [payment, reset])

  const updateMutation = useMutation({
    mutationFn: (data: PaymentFormData) =>
      paymentsApi.update(id!, {
        ...data,
        paymentMethod: data.paymentMethod as PaymentMethod,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      toast.success('Payment updated')
      navigate('/payments')
    },
    onError: (error: any) => {
      toast.error('Failed to update payment', {
        description: error.response?.data?.message || 'Please try again',
      })
    },
  })

  const onSubmit = (data: PaymentFormData) => {
    updateMutation.mutate(data)
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="Edit Payment"
        description={payment?.invoice?.invoiceNumber ? `Payment for ${payment.invoice.invoiceNumber}` : 'Update payment details'}
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <Card className="mx-auto max-w-2xl">
          <CardHeader>
            <CardTitle>Payment Details</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="amount" required>Amount</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    {...register('amount', { valueAsNumber: true })}
                    error={errors.amount?.message}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="paymentDate" required>Payment Date</Label>
                  <Input
                    id="paymentDate"
                    type="date"
                    {...register('paymentDate')}
                    error={errors.paymentDate?.message}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="paymentMethod" required>Payment Method</Label>
                  <Select
                    id="paymentMethod"
                    {...register('paymentMethod')}
                    error={errors.paymentMethod?.message}
                  >
                    <option value="CASH">Cash</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="CARD">Card</option>
                    <option value="PAYSTACK">Paystack</option>
                    <option value="OTHER">Other</option>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reference">Reference</Label>
                  <Input
                    id="reference"
                    placeholder="Transaction reference"
                    {...register('reference')}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Additional notes..."
                  {...register('notes')}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <Button type="submit" isLoading={updateMutation.isPending}>
                  Update Payment
                </Button>
                <Button type="button" variant="outline" onClick={() => navigate(-1)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
