import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { CheckCircle, CreditCard, Radio, KeyRound, Plus, Trash2 } from 'lucide-react'
import { AxiosError } from 'axios'
import { Header } from '@/components/layout'
import { Button, Input, Label, Card, CardContent, CardHeader, CardTitle, CardDescription, ConfirmDialog } from '@/components/ui'
import { moniepointApi, type MoniepointTerminal } from '@/api/moniepoint'

const setupSchema = z.object({
  clientId: z.string().min(1, 'clientId is required'),
  clientSecret: z.string().min(1, 'clientSecret is required'),
  // Optional — we try to auto-detect this from the access token when subscribing to the
  // webhook. Only fill this in if that auto-detection fails.
  businessId: z
    .string()
    .optional()
    .refine((val) => !val || (Number.isInteger(Number(val)) && Number(val) > 0), 'businessId must be a whole number'),
})

type SetupFormData = z.infer<typeof setupSchema>

const secretSchema = z.object({
  webhookSecret: z.string().min(1, 'Webhook secret is required'),
})

type SecretFormData = z.infer<typeof secretSchema>

// One business account can have several physical terminals under it — managed separately from
// the account credentials above: credentials are "is this business connected at all", terminals
// are "which physical devices can staff push a payment to".
const terminalSchema = z.object({
  serial: z.string().min(1, 'Terminal serial is required'),
  label: z.string().min(1, 'A name for this terminal is required'),
})

type TerminalFormData = z.infer<typeof terminalSchema>

export function MoniepointPage() {
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [disconnectOpen, setDisconnectOpen] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<MoniepointTerminal | null>(null)

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['moniepoint-status'],
    queryFn: () => moniepointApi.getStatus(),
  })

  const {
    register: registerSetup,
    handleSubmit: handleSetupSubmit,
    formState: { errors: setupErrors },
  } = useForm<SetupFormData>({
    resolver: zodResolver(setupSchema),
    defaultValues: { clientId: '', clientSecret: '', businessId: '' },
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

  const {
    register: registerTerminal,
    handleSubmit: handleTerminalSubmit,
    reset: resetTerminalForm,
    formState: { errors: terminalErrors },
  } = useForm<TerminalFormData>({
    resolver: zodResolver(terminalSchema),
    defaultValues: { serial: '', label: '' },
  })

  const setupMutation = useMutation({
    mutationFn: (data: SetupFormData) => moniepointApi.setup({ ...data, businessId: data.businessId || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['moniepoint-status'] })
      setIsEditing(false)
      toast.success('Moniepoint POS credentials saved', {
        description: 'Next, register the webhook subscription below',
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

  const createTerminalMutation = useMutation({
    mutationFn: (data: TerminalFormData) => moniepointApi.createTerminal(data.serial, data.label),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['moniepoint-status'] })
      resetTerminalForm()
      toast.success('Terminal added')
    },
    onError: (err) => {
      const error = err as AxiosError<{ message?: string }>
      toast.error('Could not add terminal', { description: error.response?.data?.message || 'Please try again' })
    },
  })

  const toggleTerminalMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => moniepointApi.updateTerminal(id, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['moniepoint-status'] }),
    onError: (err) => {
      const error = err as AxiosError<{ message?: string }>
      toast.error('Could not update terminal', { description: error.response?.data?.message || 'Please try again' })
    },
  })

  const removeTerminalMutation = useMutation({
    mutationFn: (id: string) => moniepointApi.removeTerminal(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['moniepoint-status'] })
      setRemoveTarget(null)
      toast.success('Terminal removed')
    },
    onError: (err) => {
      const error = err as AxiosError<{ message?: string }>
      toast.error('Could not remove terminal', { description: error.response?.data?.message || 'Please try again' })
    },
  })

  const disconnectMutation = useMutation({
    mutationFn: () => moniepointApi.disconnect(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['moniepoint-status'] })
      setDisconnectOpen(false)
      setIsEditing(false)
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
        description="Push order payments straight to your restaurant's physical Moniepoint terminal"
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
                    <p className="text-sm font-semibold text-foreground">Terminals</p>
                    <p className="-mt-2 text-xs text-muted-foreground">
                      One business account can have several physical terminals — staff pick which one to push a payment to.
                    </p>
                    {status.terminals.length === 0 && (
                      <p className="rounded-xl border border-dashed border-[#c4c5d7]/40 p-4 text-sm text-muted-foreground">
                        No terminals yet — add one below before staff can push a card payment.
                      </p>
                    )}
                    {status.terminals.map((terminal) => (
                      <div key={terminal.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#c4c5d7]/30 p-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#eef4ff] text-[#0037b0]">
                            <CreditCard className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-foreground">{terminal.label}</p>
                            <p className="truncate text-xs text-muted-foreground">{terminal.serial}</p>
                          </div>
                          {!terminal.isActive && (
                            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                              Inactive
                            </span>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            isLoading={toggleTerminalMutation.isPending}
                            onClick={() => toggleTerminalMutation.mutate({ id: terminal.id, isActive: !terminal.isActive })}
                          >
                            {terminal.isActive ? 'Deactivate' : 'Activate'}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                            onClick={() => setRemoveTarget(terminal)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    <form
                      onSubmit={handleTerminalSubmit((data) => createTerminalMutation.mutate(data))}
                      className="flex flex-col gap-2 rounded-xl border border-dashed border-[#c4c5d7]/40 p-4 sm:flex-row sm:items-start"
                    >
                      <Input
                        placeholder="Terminal name, e.g. Front Counter"
                        {...registerTerminal('label')}
                        error={terminalErrors.label?.message}
                      />
                      <Input
                        placeholder="Terminal serial number"
                        {...registerTerminal('serial')}
                        error={terminalErrors.serial?.message}
                      />
                      <Button type="submit" size="sm" isLoading={createTerminalMutation.isPending} className="shrink-0 min-h-[44px]">
                        <Plus className="h-4 w-4" />
                        Add
                      </Button>
                    </form>
                  </div>

                  <div className="space-y-3">
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
                      onClick={() => setIsEditing(true)}
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
                  Get these from the restaurant's own Moniepoint app: Settings → POS Terminal Configuration → Activate ERP
                  Integration → POS app developer → Select your Integration.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSetupSubmit((data) => setupMutation.mutate(data))} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="clientId" required className="text-sm font-semibold text-foreground">
                      Client ID
                    </Label>
                    <Input id="clientId" {...registerSetup('clientId')} error={setupErrors.clientId?.message} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="clientSecret" required className="text-sm font-semibold text-foreground">
                      Client Secret
                    </Label>
                    <Input
                      id="clientSecret"
                      type="password"
                      placeholder="Shown only once when generated — paste immediately"
                      {...registerSetup('clientSecret')}
                      error={setupErrors.clientSecret?.message}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="businessId" className="text-sm font-semibold text-foreground">
                      Business ID <span className="font-normal text-muted-foreground">(optional — usually auto-detected)</span>
                    </Label>
                    <Input
                      id="businessId"
                      inputMode="numeric"
                      placeholder="Leave blank unless webhook subscription fails to auto-detect it"
                      {...registerSetup('businessId')}
                      error={setupErrors.businessId?.message}
                    />
                  </div>

                  <div className="pt-2 flex gap-3">
                    <Button
                      type="submit"
                      isLoading={setupMutation.isPending}
                      className="flex-1 min-h-[44px] bg-gradient-to-br from-[#0037b0] to-[#1d4ed8] text-white hover:brightness-110 shadow-md font-semibold text-sm tracking-wide rounded-xl"
                    >
                      {status?.isSetup ? 'Save Changes' : 'Save & Continue'}
                    </Button>
                    {isEditing && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsEditing(false)}
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

      <ConfirmDialog
        isOpen={disconnectOpen}
        onClose={() => setDisconnectOpen(false)}
        onConfirm={() => disconnectMutation.mutate()}
        title="Disconnect Moniepoint POS?"
        description="This removes the stored credentials, webhook secret, and all registered terminals. Cashiers will no longer be able to push payments until it's reconnected."
        confirmText="Disconnect"
        isDangerous
        isLoading={disconnectMutation.isPending}
      />

      <ConfirmDialog
        isOpen={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={() => removeTarget && removeTerminalMutation.mutate(removeTarget.id)}
        title={`Remove "${removeTarget?.label}"?`}
        description="Staff will no longer be able to push payments to this terminal. Its past transaction history is kept."
        confirmText="Remove"
        isDangerous
        isLoading={removeTerminalMutation.isPending}
      />
    </div>
  )
}
