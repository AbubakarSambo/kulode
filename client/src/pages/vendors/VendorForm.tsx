import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Header } from '@/components/layout'
import { Button, Input, Label, Textarea, Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { vendorsApi } from '@/api'
import { posthog } from '@/lib/posthog'
import { useOverscrollBounce } from '@/hooks'

const vendorSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  serviceDescription: z.string().optional(),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  bankAccountNumber: z.string().optional(),
  bankName: z.string().optional(),
})

type VendorFormData = z.infer<typeof vendorSchema>

interface VendorFormPageProps {
  mode?: 'create' | 'edit'
  initialData?: VendorFormData & { id: string }
}

function VendorFormPage({ mode = 'create', initialData }: VendorFormPageProps) {
  const scrollContainerRef = useOverscrollBounce<HTMLDivElement>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isEdit = mode === 'edit'

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<VendorFormData>({
    resolver: zodResolver(vendorSchema),
    defaultValues: initialData || {
      name: '',
      serviceDescription: '',
      contactPerson: '',
      phone: '',
      email: '',
      bankAccountNumber: '',
      bankName: '',
    },
  })

  const createMutation = useMutation({
    mutationFn: (data: VendorFormData) => vendorsApi.create({
      ...data,
      email: data.email || undefined,
      serviceDescription: data.serviceDescription || undefined,
      contactPerson: data.contactPerson || undefined,
      phone: data.phone || undefined,
      bankAccountNumber: data.bankAccountNumber || undefined,
      bankName: data.bankName || undefined,
    }),
    onSuccess: (vendor) => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] })
      posthog.capture('vendor_created', { vendor_id: vendor.id })
      toast.success('Vendor created', { description: `${vendor.name} has been added` })
      navigate(`/vendors/${vendor.id}`)
    },
    onError: (error: any) => {
      toast.error('Failed to create vendor', {
        description: error.response?.data?.message || 'Please try again',
      })
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: VendorFormData) => vendorsApi.update(initialData!.id, {
      ...data,
      email: data.email || undefined,
      serviceDescription: data.serviceDescription || undefined,
      contactPerson: data.contactPerson || undefined,
      phone: data.phone || undefined,
      bankAccountNumber: data.bankAccountNumber || undefined,
      bankName: data.bankName || undefined,
    }),
    onSuccess: (vendor) => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] })
      queryClient.invalidateQueries({ queryKey: ['vendors', initialData!.id] })
      posthog.capture('vendor_updated', { vendor_id: vendor.id })
      toast.success('Vendor updated', { description: 'Changes have been saved' })
      navigate(`/vendors/${vendor.id}`)
    },
    onError: (error: any) => {
      toast.error('Failed to update vendor', {
        description: error.response?.data?.message || 'Please try again',
      })
    },
  })

  const onSubmit = (data: VendorFormData) => {
    if (isEdit) {
      updateMutation.mutate(data)
    } else {
      createMutation.mutate(data)
    }
  }

  const isLoading = createMutation.isPending || updateMutation.isPending

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title={isEdit ? 'Edit Vendor' : 'New Vendor'}
        description={isEdit ? 'Update vendor information' : 'Add a new vendor to your organization'}
      />

      <div ref={scrollContainerRef} className="flex-1 overflow-auto p-4 sm:p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="mx-auto max-w-2xl space-y-6">
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" required>Vendor Name</Label>
                <Input
                  id="name"
                  placeholder="Acme Supplies Ltd"
                  {...register('name')}
                  error={errors.name?.message}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="serviceDescription">Service Description</Label>
                <Textarea
                  id="serviceDescription"
                  placeholder="Describe the services this vendor provides..."
                  {...register('serviceDescription')}
                  error={errors.serviceDescription?.message}
                />
              </div>
            </CardContent>
          </Card>

          {/* Contact Info */}
          <Card>
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="contactPerson">Contact Person</Label>
                <Input
                  id="contactPerson"
                  placeholder="John Doe"
                  {...register('contactPerson')}
                  error={errors.contactPerson?.message}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="contact@example.com"
                    {...register('email')}
                    error={errors.email?.message}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    placeholder="+234 123 456 7890"
                    {...register('phone')}
                    error={errors.phone?.message}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Bank Details */}
          <Card>
            <CardHeader>
              <CardTitle>Bank Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="bankName">Bank Name</Label>
                  <Input
                    id="bankName"
                    placeholder="First Bank"
                    {...register('bankName')}
                    error={errors.bankName?.message}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bankAccountNumber">Account Number</Label>
                  <Input
                    id="bankAccountNumber"
                    placeholder="0123456789"
                    {...register('bankAccountNumber')}
                    error={errors.bankAccountNumber?.message}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button type="submit" isLoading={isLoading}>
              {isEdit ? 'Save Changes' : 'Create Vendor'}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate(-1)}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function NewVendorPage() {
  return <VendorFormPage mode="create" />
}

export function EditVendorPage() {
  const { id } = useParams<{ id: string }>()

  const { data: vendor, isLoading } = useQuery({
    queryKey: ['vendors', id],
    queryFn: () => vendorsApi.get(id!),
    enabled: !!id,
  })

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!vendor) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground">Vendor not found</p>
      </div>
    )
  }

  return (
    <VendorFormPage
      mode="edit"
      initialData={{
        id: vendor.id,
        name: vendor.name,
        serviceDescription: vendor.serviceDescription || '',
        contactPerson: vendor.contactPerson || '',
        phone: vendor.phone || '',
        email: vendor.email || '',
        bankAccountNumber: vendor.bankAccountNumber || '',
        bankName: vendor.bankName || '',
      }}
    />
  )
}
