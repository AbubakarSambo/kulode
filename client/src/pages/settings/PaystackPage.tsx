import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { CheckCircle, Landmark, X } from 'lucide-react'
import { Header } from '@/components/layout'
import { Button, Input, Label, Card, CardContent, CardHeader, CardTitle, CardDescription, SearchableSelect } from '@/components/ui'
import apiClient from '@/api/client'
import { posthog } from '@/lib/posthog'
import { useAuthStore } from '@/stores/auth'
import type { ApiResponse } from '@/types'
import { AxiosError } from 'axios'

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
    const response = await apiClient.post<ApiResponse<unknown>>('/organizations/setup-paystack', data)
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
  const currentUser = useAuthStore((state) => state.user)
  const [verifiedName, setVerifiedName] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)

  // Security Modal States
  const [securityModalOpen, setSecurityModalOpen] = useState(false)
  const [securityAction, setSecurityAction] = useState<'change' | 'disconnect' | null>(null)
  const [securityPassword, setSecurityPassword] = useState('')
  const [securityEmail, setSecurityEmail] = useState('')
  const [securityError, setSecurityError] = useState<string | null>(null)
  const [securityLoading, setSecurityLoading] = useState(false)
  const [isSSO, setIsSSO] = useState(false)

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
    setValue,
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
      posthog.capture('paystack_bank_verified')
      setVerifiedName(data.account_name)
      toast.success('Account verified', { description: data.account_name })
    },
    onError: (err) => {
      const error = err as AxiosError<{ message?: string }>
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
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] })
      setIsEditing(false)
      setVerifiedName(null)
      posthog.capture('paystack_integration_completed')
      toast.success('Paystack setup complete', {
        description: 'You can now receive payments via Paystack',
      })
    },
    onError: (err) => {
      const error = err as AxiosError<{ message?: string }>
      toast.error('Setup failed', {
        description: error.response?.data?.message || 'Please try again',
      })
    },
  })

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.delete('/organizations/disconnect-paystack')
      return response.data
    },
    onSuccess: () => {
      posthog.capture('paystack_disconnected')
      queryClient.invalidateQueries({ queryKey: ['paystack-status'] })
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] })
      setIsEditing(false)
      toast.success('Paystack integration disconnected')
    },
    onError: (err) => {
      const error = err as AxiosError<{ message?: string }>
      toast.error('Disconnection failed', {
        description: error.response?.data?.message || 'Please try again',
      })
    },
  })

  const openSecurityModal = async (action: 'change' | 'disconnect') => {
    setSecurityLoading(true)
    setSecurityError(null)
    setSecurityPassword('')
    setSecurityEmail('')
    setSecurityAction(action)
    try {
      const response = await apiClient.post('/auth/verify-password', {})
      setIsSSO(response.data.isSSO)
      setSecurityModalOpen(true)
    } catch (err) {
      const error = err as AxiosError<{ message?: string }>
      toast.error('Security check failed', {
        description: error.response?.data?.message || 'Could not initiate verification',
      })
    } finally {
      setSecurityLoading(false)
    }
  }

  const handleSecurityConfirm = async () => {
    setSecurityError(null)
    setSecurityLoading(true)

    try {
      if (isSSO) {
        if (securityEmail.trim().toLowerCase() !== currentUser?.email.trim().toLowerCase()) {
          setSecurityError('Incorrect email address entered.')
          setSecurityLoading(false)
          return
        }
      } else {
        if (!securityPassword) {
          setSecurityError('Password is required.')
          setSecurityLoading(false)
          return
        }
        const response = await apiClient.post('/auth/verify-password', { password: securityPassword })
        if (!response.data.valid) {
          setSecurityError('Invalid password. Please try again.')
          setSecurityLoading(false)
          return
        }
      }

      setSecurityModalOpen(false)
      if (securityAction === 'disconnect') {
        disconnectMutation.mutate()
      } else if (securityAction === 'change') {
        setIsEditing(true)
      }
    } catch (err) {
      const error = err as AxiosError<{ message?: string }>
      setSecurityError(error.response?.data?.message || 'Verification failed. Please try again.')
    } finally {
      setSecurityLoading(false)
    }
  }

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

  const showSetupForm = !status?.isSetup || isEditing

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background">
      <Header
        title="Paystack Integration"
        description="Configure automated payment processing and settlements for your invoices"
      />

      <div className="flex-1 overflow-auto p-6 sm:p-8">
        <div className="mx-auto max-w-2xl space-y-8">
          {/* Integration Overview Card */}
          {!isEditing && status?.isSetup && (
            <Card className="border-0 overflow-hidden">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl font-bold text-foreground">
                      Paystack Connection
                    </CardTitle>
                    <CardDescription className="text-sm text-muted-foreground mt-1">
                      Manage how your customers pay invoices and where funds are settled
                    </CardDescription>
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#6ffbbe]/30 text-[#006c49] border border-[#006c49]/20">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#006c49] animate-pulse" />
                    Connected
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Settlement Bank Card Visual */}
                  <div className="relative overflow-hidden rounded-2xl bg-[#eef4ff] p-6 text-[#121c28]">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div className="flex items-center gap-4">
                        <div className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-[#0037b0] shadow-sm">
                          <Landmark className="h-6 w-6" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-[#434655]/70">Settlement Account</p>
                          <h4 className="text-base font-bold text-[#121c28] mt-0.5">{status.bankAccountName}</h4>
                          <p className="text-xs text-[#434655] mt-0.5">
                            Bank: <span className="font-semibold text-[#121c28]">{status.settlementBank}</span>
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex flex-col items-start md:items-end gap-1.5 shrink-0 border-t border-[#c4c5d7]/20 md:border-t-0 pt-4 md:pt-0">
                        <p className="text-xs font-semibold uppercase tracking-wider text-[#434655]/70">Active Channels</p>
                        <div className="flex flex-wrap gap-1.5">
                          <span className="text-[10px] font-semibold bg-white text-[#0037b0] px-2.5 py-1 rounded-lg shadow-sm border border-[#0037b0]/10">
                            Cards
                          </span>
                          <span className="text-[10px] font-semibold bg-white text-[#0037b0] px-2.5 py-1 rounded-lg shadow-sm border border-[#0037b0]/10">
                            Bank Transfer
                          </span>
                          <span className="text-[10px] font-semibold bg-white text-[#0037b0] px-2.5 py-1 rounded-lg shadow-sm border border-[#0037b0]/10">
                            USSD
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="rounded-xl bg-[#eef4ff] p-4 text-xs text-[#434655] flex items-start gap-3">
                    <CheckCircle className="h-4 w-4 text-[#006c49] shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-[#121c28]">Automatic Settlement Active</p>
                      <p className="mt-0.5">
                        Payments made to your invoices are processed securely via Paystack. 
                        <strong> Note:</strong> For security reasons, your very first payout will be verified and settled within 24–48 hours. 
                        All subsequent settlements will be swept to this account automatically on standard T+1 business days.
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 flex flex-col sm:flex-row gap-3 border-t border-[#c4c5d7]/20 mt-6 pt-6">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => openSecurityModal('change')}
                      className="flex-1 min-h-[44px] border-[#c4c5d7]/40 text-[#0037b0] hover:bg-[#eef4ff] font-semibold active:scale-98"
                    >
                      Change Bank Details
                    </Button>
                    <Button
                      type="button"
                      onClick={() => openSecurityModal('disconnect')}
                      className="flex-1 min-h-[44px] bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700 active:scale-98 transition-colors duration-200 border-0 font-semibold rounded-xl"
                    >
                      Disconnect Integration
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Setup Form */}
          {showSetupForm && (
            <Card className="border-0">
              <CardHeader>
                <CardTitle className="text-xl font-bold text-foreground">
                  {status?.isSetup ? 'Update Bank Account' : 'Bank Account Setup'}
                </CardTitle>
                <CardDescription className="text-sm text-muted-foreground">
                  Specify the bank account where your customer invoice payments should be settled
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="bankCode" required className="text-sm font-semibold text-foreground">
                      Destination Bank
                    </Label>
                    <SearchableSelect
                      id="bankCode"
                      options={banks ? banks.map((b) => ({ id: b.code, label: b.name })) : []}
                      value={bankCode}
                      onChange={(val) => {
                        setValue('bankCode', val, { shouldValidate: true })
                        setVerifiedName(null)
                      }}
                      placeholder="Choose your bank"
                      disabled={banksLoading}
                      error={errors.bankCode?.message}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="accountNumber" required className="text-sm font-semibold text-[#121c28]">
                      Account Number
                    </Label>
                    <div className="flex gap-3">
                      <Input
                        id="accountNumber"
                        placeholder="0123456789 (10 digits)"
                        maxLength={10}
                        {...register('accountNumber')}
                        error={errors.accountNumber?.message}
                        className="border-[#c4c5d7]/40 bg-white text-[#121c28] focus:border-[#0037b0] transition-colors"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleVerify}
                        disabled={!bankCode || accountNumber.length !== 10}
                        isLoading={verifyMutation.isPending}
                        className="min-h-[44px] border-[#c4c5d7]/40 text-[#0037b0] hover:bg-[#eef4ff] active:scale-98"
                      >
                        Verify
                      </Button>
                    </div>
                  </div>

                  {verifiedName && (
                    <div className="rounded-xl border border-[#006c49]/30 bg-[#006c49]/5 p-4 transition-all duration-300">
                      <p className="flex items-center gap-2 text-sm text-[#006c49] font-semibold">
                        <CheckCircle className="h-4 w-4 shrink-0" />
                        Account Verified: <span className="underline">{verifiedName}</span>
                      </p>
                    </div>
                  )}

                  <div className="pt-2 flex gap-3">
                    <Button 
                      type="submit" 
                      disabled={!verifiedName}
                      isLoading={setupMutation.isPending}
                      className="flex-1 min-h-[44px] bg-gradient-to-br from-[#0037b0] to-[#1d4ed8] text-white hover:brightness-110 shadow-md font-semibold text-sm tracking-wide rounded-xl"
                    >
                      {status?.isSetup ? 'Save Changes' : 'Save & Enable Paystack Integration'}
                    </Button>
                    {isEditing && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setIsEditing(false)
                          setVerifiedName(null)
                        }}
                        className="min-h-[44px] border-[#c4c5d7]/40 text-[#434655] hover:bg-[#eef4ff] active:scale-98"
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {securityModalOpen && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300"
            onClick={() => !securityLoading && setSecurityModalOpen(false)}
          />
          <div className="relative w-full max-w-md transform overflow-hidden rounded-[28px] bg-card text-card-foreground border border-border p-6 shadow-[0px_12px_32px_rgba(0,55,176,0.12)] transition-all animate-in fade-in zoom-in-95 duration-200 z-50">
            <button
              onClick={() => setSecurityModalOpen(false)}
              disabled={securityLoading}
              className="absolute right-5 top-5 rounded-full p-1.5 text-slate-400 hover:bg-accent hover:text-foreground transition-all cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center border-0 bg-transparent"
              aria-label="Close"
            >
              <X size={16} strokeWidth={2} />
            </button>

            <div className="mt-2 text-left pr-8">
              <h3 className="text-lg font-bold text-foreground leading-tight">
                {securityAction === 'disconnect' ? 'Confirm Disconnection' : 'Security Verification'}
              </h3>
              <p className="mt-3 text-xs font-semibold text-muted-foreground leading-relaxed">
                {securityAction === 'disconnect' 
                  ? 'Warning: Disconnecting Paystack will disable digital payment links on all active invoices. Payments will no longer be settled automatically.' 
                  : 'Please verify your identity before changing your settlement bank account.'}
              </p>
            </div>

            <div className="mt-6 space-y-4">
              {isSSO ? (
                <div className="space-y-2">
                  <Label htmlFor="securityEmail" required className="text-xs font-bold text-slate-700">
                    Confirm Registered Email Address
                  </Label>
                  <p className="text-[10px] text-slate-400">
                    Type your email (<span className="font-semibold text-slate-600">{currentUser?.email}</span>) to verify ownership.
                  </p>
                  <Input
                    id="securityEmail"
                    type="email"
                    placeholder="Enter your email"
                    value={securityEmail}
                    onChange={(e) => setSecurityEmail(e.target.value)}
                    className="border-[#c4c5d7]/40 bg-white text-[#121c28] focus:border-[#0037b0] transition-colors"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="securityPassword" required className="text-xs font-bold text-slate-700">
                    Confirm Account Password
                  </Label>
                  <Input
                    id="securityPassword"
                    type="password"
                    placeholder="Enter your password"
                    value={securityPassword}
                    onChange={(e) => setSecurityPassword(e.target.value)}
                    className="border-[#c4c5d7]/40 bg-white text-[#121c28] focus:border-[#0037b0] transition-colors"
                  />
                </div>
              )}

              {securityError && (
                <p className="text-xs font-semibold text-rose-600 mt-2 bg-rose-50 border border-rose-100 p-2.5 rounded-lg">
                  {securityError}
                </p>
              )}
            </div>

            <div className="mt-6 flex flex-row items-center justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={securityLoading}
                onClick={() => setSecurityModalOpen(false)}
                className="px-5 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-600 active:scale-98 transition-all min-h-[44px]"
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={securityLoading}
                onClick={handleSecurityConfirm}
                className={securityAction === 'disconnect' 
                  ? "px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold active:scale-98 transition-all min-h-[44px] border-0"
                  : "px-5 py-2.5 rounded-xl bg-[#0037b0] hover:bg-[#0037b0]/90 text-white text-xs font-extrabold active:scale-98 transition-all min-h-[44px] border-0"
                }
                isLoading={securityLoading}
              >
                {securityAction === 'disconnect' ? 'Disconnect' : 'Verify'}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

