import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { CheckCircle, Radio, KeyRound, Building2 } from 'lucide-react'
import { AxiosError } from 'axios'
import { Header } from '@/components/layout'
import { Button, Input, Label, Card, CardContent, CardHeader, CardTitle, CardDescription, ConfirmDialog } from '@/components/ui'
import { moniepointApi, type MoniepointBusiness } from '@/api/moniepoint'

const setupSchema = z.object({
  clientId: z.string().min(1, 'clientId is required'),
  clientSecret: z.string().min(1, 'API key is required'),
})

type SetupFormData = z.infer<typeof setupSchema>

const secretSchema = z.object({
  webhookSecret: z.string().min(1, 'Webhook secret is required'),
})

type SecretFormData = z.infer<typeof secretSchema>

export function MoniepointPage() {
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [disconnectOpen, setDisconnectOpen] = useState(false)
  // Step 2 of setup: the businesses the entered API key can access (from GET /v1/introspect),
  // and which one the user picked. null means we're still on step 1 (entering credentials).
  const [businesses, setBusinesses] = useState<MoniepointBusiness[] | null>(null)
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null)

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['moniepoint-status'],
    queryFn: () => moniepointApi.getStatus(),
  })

  const {
    register: registerSetup,
    handleSubmit: handleSetupSubmit,
    getValues: getSetupValues,
    reset: resetSetupForm,
    formState: { errors: setupErrors },
  } = useForm<SetupFormData>({
    resolver: zodResolver(setupSchema),
    defaultValues: { clientId: '', clientSecret: '' },
  })

  const resetSetupFlow = () => {
    setBusinesses(null)
    setSelectedBusinessId(null)
    resetSetupForm()
  }

  const introspectMutation = useMutation({
    mutationFn: (data: SetupFormData) => moniepointApi.introspect(data.clientSecret),
    onSuccess: (list) => {
      setBusinesses(list)
      // With a single business there is nothing to choose, but we still show it so the user
      // can confirm it's the right account before saving.
      setSelectedBusinessId(list.length === 1 ? list[0].id : (list.find((b) => b.id === status?.businessId)?.id ?? null))
    },
    onError: (err) => {
      const error = err as AxiosError<{ message?: string }>
      toast.error('Could not verify API key', { description: error.response?.data?.message || 'Please try again' })
    },
  })

  const {
    register: registerSecret,
    handleSubmit: handleSecretSubmit,
    reset: resetSecretForm,
    formState: { errors: secretErrors },
  } = useForm<SecretFormData>({
    resolver: zodResolver(secretSchema),
    defaultValues: { webhookSecret: '' },
  })

  const setupMutation = useMutation({
    mutationFn: (businessId: string) => moniepointApi.setup({ ...getSetupValues(), businessId }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['moniepoint-status'] })
      setIsEditing(false)
      resetSetupFlow()
      const needsSubscription = !status?.isWebhookSubscribed || result.businessChanged
      toast.success(`Connected to ${result.businessName}`, {
        description: needsSubscription ? 'Next, register the webhook subscription below' : undefined,
      })
    },
    onError: (err) => {
      const error = err as AxiosError<{ message?: string }>
      toast.error('Setup failed', { description: error.response?.data?.message || 'Please try again' })
    },
  })

  const subscribeMutation = useMutation({
    mutationFn: () => moniepointApi.subscribeWebhook(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['moniepoint-status'] })
      toast.success('Webhook subscription registered', {
        description: 'Now copy the webhook secret from your Moniepoint dashboard and paste it below',
      })
    },
    onError: (err) => {
      const error = err as AxiosError<{ message?: string }>
      toast.error('Subscription failed', { description: error.response?.data?.message || 'Please try again' })
    },
  })

  const secretMutation = useMutation({
    mutationFn: (data: SecretFormData) => moniepointApi.setWebhookSecret(data.webhookSecret),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['moniepoint-status'] })
      resetSecretForm()
      toast.success('Webhook secret saved')
    },
    onError: (err) => {
      const error = err as AxiosError<{ message?: string }>
      toast.error('Could not save webhook secret', { description: error.response?.data?.message || 'Please try again' })
    },
  })

  const disconnectMutation = useMutation({
    mutationFn: () => moniepointApi.disconnect(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['moniepoint-status'] })
      setDisconnectOpen(false)
      setIsEditing(false)
      resetSetupFlow()
      toast.success('Moniepoint POS integration disconnected')
    },
    onError: (err) => {
      const error = err as AxiosError<{ message?: string }>
      toast.error('Disconnection failed', { description: error.response?.data?.message || 'Please try again' })
    },
  })

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
        title="Moniepoint POS"
        description="Automatically reconcile card swipes and bank transfers into your Moniepoint account against open orders"
      />

      <div className="flex-1 overflow-auto p-6 sm:p-8">
        <div className="mx-auto max-w-2xl space-y-8">
          {!isEditing && status?.isSetup && (
            <Card className="border-0 overflow-hidden">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl font-bold text-foreground">Moniepoint Connection</CardTitle>
                    <CardDescription className="text-sm text-muted-foreground mt-1">
                      Credentials for this restaurant's own Moniepoint business account
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
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 rounded-xl border border-[#c4c5d7]/30 p-4">
                      <Building2 className={`h-4 w-4 shrink-0 ${status.businessId ? 'text-[#006c49]' : 'text-muted-foreground'}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {status.businessName ?? (status.businessId ? 'Moniepoint business' : 'No business selected')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {status.businessId ? `Business ID ${status.businessId}` : 'Click Change Credentials to pick your business'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-xl border border-[#c4c5d7]/30 p-4">
                      <div className="flex items-center gap-3">
                        <Radio className={`h-4 w-4 shrink-0 ${status.isWebhookSubscribed ? 'text-[#006c49]' : 'text-muted-foreground'}`} />
                        <div>
                          <p className="text-sm font-semibold text-foreground">Webhook subscription</p>
                          <p className="text-xs text-muted-foreground">Tells Moniepoint where to send payment confirmations</p>
                        </div>
                      </div>
                      {status.isWebhookSubscribed ? (
                        <span className="text-xs font-semibold text-[#006c49]">Registered</span>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => subscribeMutation.mutate()}
                          isLoading={subscribeMutation.isPending}
                          className="min-h-[36px]"
                        >
                          Subscribe
                        </Button>
                      )}
                    </div>

                    {status.isWebhookSubscribed && (
                      <div className="rounded-xl border border-[#c4c5d7]/30 p-4">
                        <div className="flex items-center gap-3 mb-3">
                          <KeyRound className={`h-4 w-4 shrink-0 ${status.hasWebhookSecret ? 'text-[#006c49]' : 'text-muted-foreground'}`} />
                          <div>
                            <p className="text-sm font-semibold text-foreground">Webhook secret</p>
                            <p className="text-xs text-muted-foreground">
                              Copy this from the subscription's menu in your Moniepoint dashboard — shown only once
                            </p>
                          </div>
                          {status.hasWebhookSecret && <CheckCircle className="h-4 w-4 text-[#006c49] ml-auto shrink-0" />}
                        </div>
                        <form onSubmit={handleSecretSubmit((data) => secretMutation.mutate(data))} className="flex gap-2">
                          <Input
                            placeholder={status.hasWebhookSecret ? 'Enter a new secret to replace it' : 'Paste webhook secret'}
                            {...registerSecret('webhookSecret')}
                            error={secretErrors.webhookSecret?.message}
                          />
                          <Button type="submit" size="sm" isLoading={secretMutation.isPending} className="min-h-[44px] shrink-0">
                            Save
                          </Button>
                        </form>
                      </div>
                    )}
                  </div>

                  <div className="pt-4 flex flex-col sm:flex-row gap-3 border-t border-[#c4c5d7]/20 mt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        resetSetupFlow()
                        setIsEditing(true)
                      }}
                      className="flex-1 min-h-[44px] border-[#c4c5d7]/40 text-[#0037b0] hover:bg-[#eef4ff] font-semibold active:scale-98"
                    >
                      Change Credentials
                    </Button>
                    <Button
                      type="button"
                      onClick={() => setDisconnectOpen(true)}
                      className="flex-1 min-h-[44px] bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700 active:scale-98 transition-colors duration-200 border-0 font-semibold rounded-xl"
                    >
                      Disconnect Integration
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {showSetupForm && (
            <Card className="border-0">
              <CardHeader>
                <CardTitle className="text-xl font-bold text-foreground">
                  {status?.isSetup ? 'Update Moniepoint Credentials' : 'Connect Moniepoint Business Account'}
                </CardTitle>
                <CardDescription className="text-sm text-muted-foreground">
                  {businesses
                    ? 'Choose the Moniepoint business whose card payments and transfers should come into Tarione.'
                    : "Get these from the restaurant's Moniepoint dashboard: Settings → POS Terminal Configuration → Activate ERP Integration → POS APPS Developer → API Keys → Create New API Key."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!businesses ? (
                  <form onSubmit={handleSetupSubmit((data) => introspectMutation.mutate(data))} className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="clientId" required className="text-sm font-semibold text-foreground">
                        Client ID
                      </Label>
                      <Input id="clientId" {...registerSetup('clientId')} error={setupErrors.clientId?.message} />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="clientSecret" required className="text-sm font-semibold text-foreground">
                        API Key
                      </Label>
                      <Input
                        id="clientSecret"
                        type="password"
                        placeholder="mptp_… (shown only once when generated, so paste it straight away)"
                        {...registerSetup('clientSecret')}
                        error={setupErrors.clientSecret?.message}
                      />
                    </div>

                    <div className="pt-2 flex gap-3">
                      <Button
                        type="submit"
                        isLoading={introspectMutation.isPending}
                        className="flex-1 min-h-[44px] bg-gradient-to-br from-[#0037b0] to-[#1d4ed8] text-white hover:brightness-110 shadow-md font-semibold text-sm tracking-wide rounded-xl"
                      >
                        Find My Business
                      </Button>
                      {isEditing && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            resetSetupFlow()
                            setIsEditing(false)
                          }}
                          className="min-h-[44px] border-[#c4c5d7]/40 text-[#434655] hover:bg-[#eef4ff] active:scale-98"
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </form>
                ) : (
                  <div className="space-y-6">
                    <div role="radiogroup" aria-label="Moniepoint business" className="space-y-2">
                      {businesses.map((business) => {
                        const selected = business.id === selectedBusinessId
                        return (
                          <button
                            key={business.id}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => setSelectedBusinessId(business.id)}
                            className={`w-full flex items-center gap-3 rounded-xl border p-4 text-left transition-colors ${
                              selected ? 'border-[#0037b0] bg-[#eef4ff]' : 'border-[#c4c5d7]/30 hover:bg-[#eef4ff]/50'
                            }`}
                          >
                            <span
                              className={`h-4 w-4 shrink-0 rounded-full border-2 ${
                                selected ? 'border-[#0037b0] bg-[#0037b0] shadow-[inset_0_0_0_2px_white]' : 'border-[#c4c5d7]'
                              }`}
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-foreground truncate">{business.businessName}</p>
                              <p className="text-xs text-muted-foreground">Business ID {business.id}</p>
                            </div>
                            {status?.businessId === business.id && (
                              <span className="ml-auto text-xs font-semibold text-[#006c49] shrink-0">Current</span>
                            )}
                          </button>
                        )
                      })}
                    </div>

                    {status?.isWebhookSubscribed && status.businessId && selectedBusinessId && selectedBusinessId !== status.businessId && (
                      <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-3">
                        Switching business removes the current webhook subscription. You'll need to subscribe again and paste a new
                        webhook secret.
                      </p>
                    )}

                    <div className="pt-2 flex gap-3">
                      <Button
                        type="button"
                        disabled={!selectedBusinessId}
                        onClick={() => selectedBusinessId && setupMutation.mutate(selectedBusinessId)}
                        isLoading={setupMutation.isPending}
                        className="flex-1 min-h-[44px] bg-gradient-to-br from-[#0037b0] to-[#1d4ed8] text-white hover:brightness-110 shadow-md font-semibold text-sm tracking-wide rounded-xl"
                      >
                        {status?.isSetup ? 'Save Changes' : 'Connect Business'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setBusinesses(null)
                          setSelectedBusinessId(null)
                        }}
                        className="min-h-[44px] border-[#c4c5d7]/40 text-[#434655] hover:bg-[#eef4ff] active:scale-98"
                      >
                        Back
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={disconnectOpen}
        onClose={() => setDisconnectOpen(false)}
        onConfirm={() => disconnectMutation.mutate()}
        title="Disconnect Moniepoint POS?"
        description="This removes the stored credentials and webhook secret. Card payments and transfers will no longer be auto-reconciled until it's reconnected."
        confirmText="Disconnect"
        isDangerous
        isLoading={disconnectMutation.isPending}
      />
    </div>
  )
}
