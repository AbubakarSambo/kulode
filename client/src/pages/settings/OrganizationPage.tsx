import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ImagePlus, X, Lock, Copy, Check } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Header } from '@/components/layout'
import { Button, Input, Label, Textarea, Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { organizationsApi, googleSheetsApi } from '@/api'
import { useSubscription } from '@/hooks/useSubscription'
import { posthog } from '@/lib/posthog'

const organizationSchema = z.object({
  name: z.string().min(1, 'Organization name is required'),
  email: z.string().email('Invalid email').or(z.literal('')).optional(),
  phone: z.string().max(50).optional(),
  address: z.string().optional(),
  rcNumber: z.string().max(50).optional(),
  tin: z.string().max(50).optional(),
  invoicePrefix: z.string().max(10).optional(),
  vatEnabled: z.boolean().optional(),
  showQrCode: z.boolean().optional(),
  taxRate: z.number().min(0).max(100).optional(),
  entertainmentTaxEnabled: z.boolean().optional(),
  entertainmentTaxRate: z.number().min(0).max(100).optional(),
  serviceChargeEnabled: z.boolean().optional(),
  serviceChargeRate: z.number().min(0).max(100).optional(),
  paymentTerms: z.string().max(2000).optional(),
  defaultNotes: z.string().max(2000).optional(),
  googleSheetId: z.string().optional(),
})

type OrganizationFormData = z.infer<typeof organizationSchema>

export function OrganizationPage() {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { effectivePlan } = useSubscription()
  const isPro = effectivePlan === 'PRO' || effectivePlan === 'BUSINESS'

  const { data: organization, isLoading } = useQuery({
    queryKey: ['organization'],
    queryFn: () => organizationsApi.getCurrent(),
  })

  const { data: sheetsSync } = useQuery({
    queryKey: ['google-sheets-sync-email'],
    queryFn: () => googleSheetsApi.getSyncEmail(),
  })
  const [emailCopied, setEmailCopied] = useState(false)

  const uploadLogoMutation = useMutation({
    mutationFn: (file: File) => organizationsApi.uploadLogo(file),
    onSuccess: () => {
      posthog.capture('org_logo_uploaded')
      queryClient.invalidateQueries({ queryKey: ['organization'] })
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] })
      toast.success('Logo uploaded')
    },
    onError: () => toast.error('Failed to upload logo'),
  })

  const removeLogoMutation = useMutation({
    mutationFn: () => organizationsApi.removeLogo(),
    onSuccess: () => {
      posthog.capture('org_logo_removed')
      queryClient.invalidateQueries({ queryKey: ['organization'] })
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] })
      toast.success('Logo removed')
    },
    onError: () => toast.error('Failed to remove logo'),
  })

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<OrganizationFormData>({
    resolver: zodResolver(organizationSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      address: '',
      rcNumber: '',
      tin: '',
      invoicePrefix: '',
      vatEnabled: false,
      showQrCode: false,
      taxRate: 0,
      entertainmentTaxEnabled: false,
      entertainmentTaxRate: 0,
      serviceChargeEnabled: false,
      serviceChargeRate: 0,
      paymentTerms: '',
      defaultNotes: '',
      googleSheetId: '',
    },
  })

  useEffect(() => {
    if (organization) {
      reset({
        name: organization.name,
        email: organization.email || '',
        phone: organization.phone || '',
        address: organization.address || '',
        rcNumber: organization.rcNumber || '',
        tin: organization.tin || '',
        invoicePrefix: organization.invoicePrefix,
        vatEnabled: organization.vatEnabled,
        showQrCode: organization.showQrCode ?? false,
        taxRate: Number(organization.taxRate) || 0,
        entertainmentTaxEnabled: organization.entertainmentTaxEnabled,
        entertainmentTaxRate: Number(organization.entertainmentTaxRate) || 0,
        serviceChargeEnabled: organization.serviceChargeEnabled,
        serviceChargeRate: Number(organization.serviceChargeRate) || 0,
        paymentTerms: organization.paymentTerms || '',
        defaultNotes: organization.defaultNotes || '',
        googleSheetId: organization.googleSheetId || '',
      })
    }
  }, [organization, reset])

  const updateMutation = useMutation({
    mutationFn: (data: OrganizationFormData) =>
      organizationsApi.updateCurrent({
        ...data,
        email: data.email || undefined,
        vatEnabled: !!data.vatEnabled,
        showQrCode: !!data.showQrCode,
        taxRate: Number(data.taxRate) || 0,
        entertainmentTaxEnabled: !!data.entertainmentTaxEnabled,
        entertainmentTaxRate: Number(data.entertainmentTaxRate) || 0,
        serviceChargeEnabled: !!data.serviceChargeEnabled,
        serviceChargeRate: Number(data.serviceChargeRate) || 0,
        paymentTerms: data.paymentTerms || '',
        defaultNotes: data.defaultNotes || '',
        googleSheetId: data.googleSheetId || null,
      }),
    onSuccess: () => {
      posthog.capture('org_profile_updated')
      queryClient.invalidateQueries({ queryKey: ['organization'] })
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] })
      toast.success('Organization settings saved')
    },
    onError: (error: any) => {
      toast.error('Failed to save settings', {
        description: error.response?.data?.message || 'Please try again',
      })
    },
  })

  const onSubmit = (data: OrganizationFormData) => {
    updateMutation.mutate(data)
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title="Organization" description="Manage your business information and invoice defaults" />
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="Organization"
        description="Manage your business information and invoice defaults"
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="mx-auto max-w-2xl space-y-6">
          {/* Logo */}
          <Card>
            <CardHeader>
              <CardTitle>Organization Logo</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">
                Your logo will appear in the top-left of every invoice PDF.
              </p>
              {isPro ? (
                <>
                  {organization?.logo ? (
                    <div className="flex items-start gap-4">
                      <img
                        src={organization.logo}
                        alt="Organization logo"
                        className="h-16 max-w-[160px] rounded-md border object-contain p-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        isLoading={removeLogoMutation.isPending}
                        onClick={() => removeLogoMutation.mutate()}
                      >
                        <X className="mr-2 h-4 w-4" />
                        Remove
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadLogoMutation.isPending}
                      className="flex h-20 w-full items-center justify-center gap-2 rounded-md border-2 border-dashed border-muted-foreground/30 text-sm text-muted-foreground transition-colors hover:border-muted-foreground/60 hover:text-foreground disabled:opacity-50"
                    >
                      <ImagePlus className="h-5 w-5" />
                      {uploadLogoMutation.isPending ? 'Uploading...' : 'Click to upload logo'}
                    </button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) uploadLogoMutation.mutate(file)
                      e.target.value = ''
                    }}
                  />
                  <p className="mt-2 text-xs text-muted-foreground">PNG, JPG or SVG · Max 2MB</p>
                </>
              ) : (
                <div className="flex items-center justify-between rounded-md border border-dashed p-4">
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <Lock className="h-4 w-4 shrink-0" />
                    <span>Free plan invoices show <strong>"Powered by Tari1"</strong>. Upgrade to add your logo.</span>
                  </div>
                  <Link to="/settings/billing">
                    <Button type="button" size="sm">Upgrade</Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Business Info */}
          <Card>
            <CardHeader>
              <CardTitle>Business Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" required>Organization Name</Label>
                <Input
                  id="name"
                  {...register('name')}
                  error={errors.name?.message}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    {...register('email')}
                    error={errors.email?.message}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    {...register('phone')}
                    error={errors.phone?.message}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Textarea
                  id="address"
                  {...register('address')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="rcNumber">CAC RC Number</Label>
                <Input
                  id="rcNumber"
                  placeholder="e.g., RC1234567"
                  {...register('rcNumber')}
                  error={errors.rcNumber?.message}
                />
                <p className="text-xs text-muted-foreground">
                  Shown on invoice PDFs to comply with CAC/CAMA 2020 business-letter requirements.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tin">Tax Identification Number (TIN)</Label>
                <Input
                  id="tin"
                  placeholder="e.g., 12345678-0001"
                  {...register('tin')}
                  error={errors.tin?.message}
                />
                <p className="text-xs text-muted-foreground">
                  Shown on invoice PDFs and used by the Tax compliance checklist.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Invoice Defaults */}
          <Card>
            <CardHeader>
              <CardTitle>Invoice Defaults</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invoicePrefix">Invoice Prefix</Label>
                <Input
                  id="invoicePrefix"
                  placeholder="INV"
                  {...register('invoicePrefix')}
                  error={errors.invoicePrefix?.message}
                />
              </div>

              <div className="space-y-3">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={watch('vatEnabled') || false}
                    onChange={(e) => {
                      setValue('vatEnabled', e.target.checked, { shouldDirty: true })
                      if (e.target.checked && !watch('taxRate')) {
                        setValue('taxRate', 7.5, { shouldDirty: true })
                      }
                    }}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span className="text-sm font-medium">Enable VAT</span>
                </label>
                <p className="text-xs text-muted-foreground">
                  Applies VAT at the rate below to both invoices and POS orders. The same default
                  is shown (and can be saved) in the onboarding invoice setup.
                </p>
                {watch('vatEnabled') && (
                  <div className="space-y-2">
                    <Label htmlFor="taxRate">VAT Rate (%)</Label>
                    <Input
                      id="taxRate"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      className="max-w-[200px]"
                      {...register('taxRate', { valueAsNumber: true })}
                      error={errors.taxRate?.message}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={watch('entertainmentTaxEnabled') || false}
                    onChange={(e) => {
                      setValue('entertainmentTaxEnabled', e.target.checked, { shouldDirty: true })
                      if (e.target.checked && !watch('entertainmentTaxRate')) {
                        setValue('entertainmentTaxRate', 5, { shouldDirty: true })
                      }
                    }}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span className="text-sm font-medium">Enable Entertainment Tax</span>
                </label>
                <p className="text-xs text-muted-foreground">
                  A second, stackable tax for POS orders (e.g. a state consumption/entertainment
                  tax on restaurant or bar bills). Waiters can toggle it on or off per order on the
                  Sell screen once enabled here.
                </p>
                {watch('entertainmentTaxEnabled') && (
                  <div className="space-y-2">
                    <Label htmlFor="entertainmentTaxRate">Entertainment Tax Rate (%)</Label>
                    <Input
                      id="entertainmentTaxRate"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      className="max-w-[200px]"
                      {...register('entertainmentTaxRate', { valueAsNumber: true })}
                      error={errors.entertainmentTaxRate?.message}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={watch('serviceChargeEnabled') || false}
                    onChange={(e) => {
                      setValue('serviceChargeEnabled', e.target.checked, { shouldDirty: true })
                      if (e.target.checked && !watch('serviceChargeRate')) {
                        setValue('serviceChargeRate', 10, { shouldDirty: true })
                      }
                    }}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span className="text-sm font-medium">Enable Service Charge</span>
                </label>
                <p className="text-xs text-muted-foreground">
                  A gratuity/service fee added to POS orders — not a tax, kept separate from VAT
                  and entertainment tax on receipts. Waiters can toggle it on or off per order on
                  the Sell screen once enabled here.
                </p>
                {watch('serviceChargeEnabled') && (
                  <div className="space-y-2">
                    <Label htmlFor="serviceChargeRate">Service Charge Rate (%)</Label>
                    <Input
                      id="serviceChargeRate"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      className="max-w-[200px]"
                      {...register('serviceChargeRate', { valueAsNumber: true })}
                      error={errors.serviceChargeRate?.message}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={watch('showQrCode') || false}
                    onChange={(e) => setValue('showQrCode', e.target.checked, { shouldDirty: true })}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span className="text-sm font-medium">Show address QR code on invoice PDF</span>
                </label>
                <p className="text-xs text-muted-foreground">
                  Adds a scannable QR code of your business address to the bottom-right of every invoice PDF.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="paymentTerms">Default Payment Terms</Label>
                <Textarea
                  id="paymentTerms"
                  placeholder="e.g., Payment due within 30 days of invoice date."
                  rows={4}
                  {...register('paymentTerms')}
                  error={errors.paymentTerms?.message}
                />
                <p className="text-xs text-muted-foreground">
                  These terms will be automatically added to new invoices.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="defaultNotes">Default Invoice Notes</Label>
                <Textarea
                  id="defaultNotes"
                  placeholder="e.g., Thank you for your business!"
                  rows={4}
                  {...register('defaultNotes')}
                  error={errors.defaultNotes?.message}
                />
                <p className="text-xs text-muted-foreground">
                  These notes will be automatically added to new invoices.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Google Sheets Sync */}
          <Card>
            <CardHeader>
              <CardTitle>Google Sheets Sync</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Orders, payments, and wallet activity sync to a Google Sheet you control. To set it up:
                open your Sheet, click <strong>Share</strong>, add the email below as an <strong>Editor</strong>,
                then paste the Sheet's ID below.
              </p>

              <div className="space-y-2">
                <Label>Sync Email</Label>
                <div className="flex gap-2">
                  <Input readOnly value={sheetsSync?.email ?? 'Loading...'} className="font-mono text-sm" />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={!sheetsSync?.email}
                    onClick={() => {
                      if (!sheetsSync?.email) return
                      navigator.clipboard.writeText(sheetsSync.email)
                      setEmailCopied(true)
                      setTimeout(() => setEmailCopied(false), 2000)
                    }}
                  >
                    {emailCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="googleSheetId">Google Sheet ID</Label>
                <Input
                  id="googleSheetId"
                  placeholder="e.g. 1yrBFrddzXGCuHWJF1X56-Y_wvZyO2JU-lK3yxCilibA"
                  {...register('googleSheetId')}
                  error={errors.googleSheetId?.message}
                />
                <p className="text-xs text-muted-foreground">
                  The long ID in your Sheet's URL, between <code>/d/</code> and <code>/edit</code>.
                  Leave blank to turn sync off.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex gap-3">
            <Button type="submit" isLoading={updateMutation.isPending}>
              Save Changes
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
