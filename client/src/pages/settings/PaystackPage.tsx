import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { CheckCircle, AlertCircle, Building } from 'lucide-react'
import { Header } from '@/components/layout'
import { Button, Input, Label, Select, Card, CardContent, CardHeader, CardTitle, CardDescription, Badge } from '@/components/ui'
import apiClient from '@/api/client'
import type { ApiResponse } from '@/types'

interface PaystackStatus {
  isSetup: boolean
  isVerified: boolean
  bankAccountName?: string
  settlementBank?: string
}

interface Bank {
  name: string
  code: string
}

const paystackApi = {
  getStatus: async (): Promise<PaystackStatus> => {
    const response = await apiClient.get<ApiResponse<PaystackStatus>>('/organizations/paystack-status')
    return response.data.data
  },
  getBanks: async (): Promise<Bank[]> => {
    const response = await apiClient.get<ApiResponse<Bank[]>>('/paystack/banks')
    return response.data.data
  },
  verifyAccount: async (data: { accountNumber: string; bankCode: string }) => {
    const response = await apiClient.post<ApiResponse<{ account_name: string }>>('/paystack/verify-account', data)
    return response.data.data
  },
  setup: async (data: { bankCode: string; accountNumber: string }) => {
    const response = await apiClient.post<ApiResponse<any>>('/organizations/setup-paystack', data)
    return response.data.data
  },
}

const setupSchema = z.object({
  bankCode: z.string().min(1, 'Bank is required'),
  accountNumber: z.string().min(10, 'Account number must be 10 digits').max(10, 'Account number must be 10 digits'),
})

type SetupFormData = z.infer<typeof setupSchema>

export function PaystackPage() {
  const queryClient = useQueryClient()
  const [verifiedName, setVerifiedName] = useState<string | null>(null)

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['paystack-status'],
    queryFn: () => paystackApi.getStatus(),
  })

  const { data: banks, isLoading: banksLoading } = useQuery({
    queryKey: ['paystack-banks'],
    queryFn: () => paystackApi.getBanks(),
  })

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<SetupFormData>({
    resolver: zodResolver(setupSchema),
    defaultValues: {
      bankCode: '',
      accountNumber: '',
    },
  })

  const bankCode = watch('bankCode')
  const accountNumber = watch('accountNumber')

  const verifyMutation = useMutation({
    mutationFn: () => paystackApi.verifyAccount({ accountNumber, bankCode }),
    onSuccess: (data) => {
      setVerifiedName(data.account_name)
      toast.success('Account verified', { description: data.account_name })
    },
    onError: (error: any) => {
      setVerifiedName(null)
      toast.error('Verification failed', {
        description: error.response?.data?.message || 'Could not verify account',
      })
    },
  })

  const setupMutation = useMutation({
    mutationFn: (data: SetupFormData) => paystackApi.setup(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paystack-status'] })
      toast.success('Paystack setup complete', {
        description: 'You can now receive payments via Paystack',
      })
    },
    onError: (error: any) => {
      toast.error('Setup failed', {
        description: error.response?.data?.message || 'Please try again',
      })
    },
  })

  const handleVerify = () => {
    if (bankCode && accountNumber.length === 10) {
      verifyMutation.mutate()
    }
  }

  const onSubmit = (data: SetupFormData) => {
    if (!verifiedName) {
      toast.error('Please verify your account first')
      return
    }
    setupMutation.mutate(data)
  }

  if (statusLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="Paystack Integration"
        description="Configure payment processing for your invoices"
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          {/* Current Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {status?.isSetup ? (
                  <CheckCircle className="h-5 w-5 text-success" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-warning" />
                )}
                Payment Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              {status?.isSetup ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <Badge variant="success">Connected</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Bank</span>
                    <span className="font-medium">{status.settlementBank}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Account Name</span>
                    <span className="font-medium">{status.bankAccountName}</span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  <Building className="mx-auto h-12 w-12 text-muted-foreground" />
                  <p className="mt-2 text-muted-foreground">
                    Connect your bank account to start receiving payments
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Setup Form */}
          {!status?.isSetup && (
            <Card>
              <CardHeader>
                <CardTitle>Connect Bank Account</CardTitle>
                <CardDescription>
                  Enter your bank details to receive payments from invoices
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="bankCode" required>Bank</Label>
                    <Select
                      id="bankCode"
                      {...register('bankCode')}
                      error={errors.bankCode?.message}
                      disabled={banksLoading}
                    >
                      <option value="">Select your bank</option>
                      {banks?.map((bank) => (
                        <option key={bank.code} value={bank.code}>
                          {bank.name}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="accountNumber" required>Account Number</Label>
                    <div className="flex gap-2">
                      <Input
                        id="accountNumber"
                        placeholder="0123456789"
                        maxLength={10}
                        {...register('accountNumber')}
                        error={errors.accountNumber?.message}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleVerify}
                        disabled={!bankCode || accountNumber.length !== 10}
                        isLoading={verifyMutation.isPending}
                      >
                        Verify
                      </Button>
                    </div>
                  </div>

                  {verifiedName && (
                    <div className="rounded-lg border border-success bg-success/10 p-3">
                      <p className="flex items-center gap-2 text-sm text-success">
                        <CheckCircle className="h-4 w-4" />
                        Account verified: <span className="font-medium">{verifiedName}</span>
                      </p>
                    </div>
                  )}

                  <div className="pt-4">
                    <Button 
                      type="submit" 
                      disabled={!verifiedName}
                      isLoading={setupMutation.isPending}
                    >
                      Connect Account
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
