import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Header } from '@/components/layout'
import { Button, Input, Label, Textarea, Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { organizationsApi } from '@/api'

const organizationSchema = z.object({
  name: z.string().min(1, 'Organization name is required'),
  email: z.string().email('Invalid email').or(z.literal('')).optional(),
  phone: z.string().max(50).optional(),
  address: z.string().optional(),
  invoicePrefix: z.string().max(10).optional(),
  vatEnabled: z.boolean().optional(),
  taxRate: z.number().min(0).max(100).optional(),
  paymentTerms: z.string().max(2000).optional(),
  defaultNotes: z.string().max(2000).optional(),
})

type OrganizationFormData = z.infer<typeof organizationSchema>

export function OrganizationPage() {
  const queryClient = useQueryClient()

  const { data: organization, isLoading } = useQuery({
    queryKey: ['organization'],
    queryFn: () => organizationsApi.getCurrent(),
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
      invoicePrefix: '',
      vatEnabled: false,
      taxRate: 0,
      paymentTerms: '',
      defaultNotes: '',
    },
  })

  useEffect(() => {
    if (organization) {
      reset({
        name: organization.name,
        email: organization.email || '',
        phone: organization.phone || '',
        address: organization.address || '',
        invoicePrefix: organization.invoicePrefix,
        vatEnabled: organization.vatEnabled,
        taxRate: Number(organization.taxRate) || 0,
        paymentTerms: organization.paymentTerms || '',
        defaultNotes: organization.defaultNotes || '',
      })
    }
  }, [organization, reset])

  const updateMutation = useMutation({
    mutationFn: (data: OrganizationFormData) =>
      organizationsApi.updateCurrent({
        ...data,
        email: data.email || undefined,
        vatEnabled: !!data.vatEnabled,
        taxRate: Number(data.taxRate) || 0,
        paymentTerms: data.paymentTerms || '',
        defaultNotes: data.defaultNotes || '',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization'] })
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
                  <span className="text-sm font-medium">Enable VAT on invoices</span>
                </label>
                <p className="text-xs text-muted-foreground">
                  When enabled, VAT will be applied to all new invoices at the rate specified below.
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
