import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Header } from '@/components/layout'
import { Button, Input, Label, Textarea, Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { clientsApi } from '@/api'

const clientSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
})

type ClientForm = z.infer<typeof clientSchema>

interface ClientFormPageProps {
  mode?: 'create' | 'edit'
  initialData?: ClientForm & { id: string }
}

export function ClientFormPage({ mode = 'create', initialData }: ClientFormPageProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isEdit = mode === 'edit'

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ClientForm>({
    resolver: zodResolver(clientSchema),
    defaultValues: initialData || {
      name: '',
      email: '',
      phone: '',
      address: '',
      notes: '',
    },
  })

  const createMutation = useMutation({
    mutationFn: (data: ClientForm) => clientsApi.create({
      ...data,
      email: data.email || undefined,
    }),
    onSuccess: (client) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      toast.success('Client created', { description: `${client.name} has been added` })
      navigate(`/clients/${client.id}`)
    },
    onError: (error: any) => {
      toast.error('Failed to create client', { 
        description: error.response?.data?.message || 'Please try again' 
      })
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: ClientForm) => clientsApi.update(initialData!.id, {
      ...data,
      email: data.email || undefined,
    }),
    onSuccess: (client) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      queryClient.invalidateQueries({ queryKey: ['clients', initialData!.id] })
      toast.success('Client updated', { description: 'Changes have been saved' })
      navigate(`/clients/${client.id}`)
    },
    onError: (error: any) => {
      toast.error('Failed to update client', { 
        description: error.response?.data?.message || 'Please try again' 
      })
    },
  })

  const onSubmit = (data: ClientForm) => {
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
        title={isEdit ? 'Edit Client' : 'New Client'}
        description={isEdit ? 'Update client information' : 'Add a new client to your organization'}
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <Card className="mx-auto max-w-2xl">
          <CardHeader>
            <CardTitle>Client Information</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" required>Client Name</Label>
                <Input
                  id="name"
                  placeholder="ABC Corporation"
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

              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Textarea
                  id="address"
                  placeholder="123 Business Street, Lagos"
                  {...register('address')}
                  error={errors.address?.message}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Any additional notes about this client..."
                  {...register('notes')}
                  error={errors.notes?.message}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <Button type="submit" isLoading={isLoading}>
                  {isEdit ? 'Save Changes' : 'Create Client'}
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

export function NewClientPage() {
  return <ClientFormPage mode="create" />
}
