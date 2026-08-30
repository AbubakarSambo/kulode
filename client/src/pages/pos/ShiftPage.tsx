import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Clock } from 'lucide-react'
import { Header } from '@/components/layout'
import { Button, Input, Label, Textarea, Card, CardContent, Badge } from '@/components/ui'
import { shiftsApi } from '@/api'
import { formatCurrency } from '@/lib/utils'

const openSchema = z.object({ openingFloat: z.number().min(0).optional() })
const closeSchema = z.object({ countedCash: z.number().min(0), notes: z.string().optional() })

export function ShiftPage() {
  const queryClient = useQueryClient()
  const [showCloseForm, setShowCloseForm] = useState(false)
  const [countedAmounts, setCountedAmounts] = useState<Record<string, number>>({})

  const { data: currentShift, isLoading } = useQuery({
    queryKey: ['current-shift'],
    queryFn: () => shiftsApi.current(),
  })

  const { data: recentShifts } = useQuery({
    queryKey: ['shifts'],
    queryFn: () => shiftsApi.list(),
  })

  const { data: closePreview } = useQuery({
    queryKey: ['shift-close-preview', currentShift?.id],
    queryFn: () => shiftsApi.previewClose(currentShift!.id),
    enabled: showCloseForm && !!currentShift,
  })

  const nonCashBreakdown = (closePreview?.breakdown ?? []).filter((b) => b.paymentMethod !== 'CASH')

  const openForm = useForm<z.infer<typeof openSchema>>({ resolver: zodResolver(openSchema) })
  const closeForm = useForm<z.infer<typeof closeSchema>>({ resolver: zodResolver(closeSchema) })

  const openShift = useMutation({
    mutationFn: (data: z.infer<typeof openSchema>) => shiftsApi.open(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['current-shift'] })
      queryClient.invalidateQueries({ queryKey: ['shifts'] })
      toast.success('Shift opened')
      openForm.reset()
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(message || 'Failed to open shift')
    },
  })

  const closeShift = useMutation({
    mutationFn: (data: z.infer<typeof closeSchema>) =>
      shiftsApi.close(currentShift!.id, { ...data, countedAmounts }),
    onSuccess: (closed) => {
      queryClient.invalidateQueries({ queryKey: ['current-shift'] })
      queryClient.invalidateQueries({ queryKey: ['shifts'] })
      toast.success(`Shift closed — variance ${formatCurrency(closed.variance ?? 0)}`)
      setShowCloseForm(false)
      setCountedAmounts({})
      closeForm.reset()
    },
    onError: () => toast.error('Failed to close shift'),
  })

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title="Shift" description="Open and close the till, reconcile cash" icon={Clock} />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {!currentShift ? (
          <Card className="p-6">
            <CardContent className="p-0">
              <h2 className="mb-4 text-lg font-bold text-foreground">Open a Shift</h2>
              <form onSubmit={openForm.handleSubmit((data) => openShift.mutate(data))} className="space-y-4">
                <div>
                  <Label>Starting Cash Float</Label>
                  <Input
                    type="number"
                    step="0.01"
                    {...openForm.register('openingFloat', { valueAsNumber: true })}
                    placeholder="0"
                  />
                </div>
                <Button type="submit" className="w-full" isLoading={openShift.isPending}>
                  Open Shift
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card className="p-6">
            <CardContent className="space-y-4 p-0">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-foreground">Current Shift</h2>
                <Badge variant="success">OPEN</Badge>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Opened</span>
                <span className="font-medium text-foreground">{new Date(currentShift.openedAt).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Starting Float</span>
                <span className="font-medium text-foreground">{formatCurrency(currentShift.openingFloat)}</span>
              </div>

              {!showCloseForm ? (
                <Button className="w-full" onClick={() => setShowCloseForm(true)}>
                  Close Shift
                </Button>
              ) : (
                <form onSubmit={closeForm.handleSubmit((data) => closeShift.mutate(data))} className="space-y-4">
                  <div>
                    <Label>Counted Cash in Till</Label>
                    <Input
                      type="number"
                      step="0.01"
                      {...closeForm.register('countedCash', { valueAsNumber: true })}
                      placeholder="0"
                    />
                  </div>

                  {nonCashBreakdown.length > 0 && (
                    <div className="space-y-3 rounded-md border border-border p-3">
                      <p className="text-xs font-semibold text-muted-foreground">
                        Other Payment Methods (defaults to expected — edit to note a discrepancy)
                      </p>
                      {nonCashBreakdown.map((row) => (
                        <div key={row.paymentMethod} className="flex items-center justify-between gap-3">
                          <Label className="flex-1 text-sm font-normal">{row.paymentMethod}</Label>
                          <Input
                            type="number"
                            step="0.01"
                            className="w-36"
                            defaultValue={row.expectedAmount}
                            onChange={(e) =>
                              setCountedAmounts((prev) => ({
                                ...prev,
                                [row.paymentMethod]: e.target.value === '' ? row.expectedAmount : Number(e.target.value),
                              }))
                            }
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  <div>
                    <Label>Notes (optional)</Label>
                    <Textarea {...closeForm.register('notes')} placeholder="Any discrepancy notes" />
                  </div>
                  <Button type="submit" className="w-full" isLoading={closeShift.isPending}>
                    Confirm & Close Shift
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        )}

        {recentShifts && recentShifts.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Recent Shifts</h2>
            <div className="space-y-2">
              {recentShifts.filter((s) => s.status === 'CLOSED').slice(0, 10).map((shift) => (
                <Card key={shift.id} className="p-4">
                  <CardContent className="space-y-3 p-0">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-foreground">
                          {new Date(shift.openedAt).toLocaleDateString()}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Expected {formatCurrency(shift.expectedCash ?? 0)} · Counted {formatCurrency(shift.countedCash ?? 0)}
                        </div>
                      </div>
                      <Badge variant={Math.abs(shift.variance ?? 0) < 1 ? 'success' : 'warning'}>
                        {(shift.variance ?? 0) >= 0 ? '+' : ''}{formatCurrency(shift.variance ?? 0)}
                      </Badge>
                    </div>

                    {shift.breakdowns && shift.breakdowns.length > 0 && (
                      <div className="space-y-1 border-t border-border pt-2">
                        {shift.breakdowns.map((row) => (
                          <div key={row.id} className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">{row.paymentMethod}</span>
                            <span className="text-foreground">
                              {formatCurrency(row.countedAmount)}
                              {Math.abs(row.variance) >= 1 && (
                                <span className={row.variance > 0 ? 'text-success' : 'text-warning'}>
                                  {' '}({row.variance > 0 ? '+' : ''}
                                  {formatCurrency(row.variance)})
                                </span>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
