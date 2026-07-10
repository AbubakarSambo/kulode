import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Plus, Edit, Trash2 } from 'lucide-react'
import { Header } from '@/components/layout'
import { Button, Input, Label, Card, CardContent } from '@/components/ui'
import { Modal } from '@/components/shared/Modal'
import apiClient from '@/api/client'
import { posthog } from '@/lib/posthog'
import type { ApiResponse } from '@/types'

interface Director {
  id: string
  forenames: string
  surname: string
  formerName?: string | null
  isNonNigerian: boolean
  nationality?: string | null
}

const directorsApi = {
  list: async (): Promise<Director[]> => {
    const response = await apiClient.get<ApiResponse<Director[]>>('/organizations/current/directors')
    return response.data.data
  },
  create: async (data: DirectorFormData): Promise<Director> => {
    const response = await apiClient.post<ApiResponse<Director>>('/organizations/current/directors', data)
    return response.data.data
  },
  update: async (id: string, data: DirectorFormData): Promise<Director> => {
    const response = await apiClient.patch<ApiResponse<Director>>(`/organizations/current/directors/${id}`, data)
    return response.data.data
  },
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/organizations/current/directors/${id}`)
  },
}

const directorSchema = z.object({
  forenames: z.string().min(1, 'First name is required'),
  surname: z.string().min(1, 'Surname is required'),
  formerName: z.string().optional(),
  isNonNigerian: z.boolean().optional(),
  nationality: z.string().optional(),
})

type DirectorFormData = z.infer<typeof directorSchema>

export function DirectorsPage() {
  const queryClient = useQueryClient()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingDirector, setEditingDirector] = useState<Director | null>(null)
  const [showFormerName, setShowFormerName] = useState(false)
  const [showNationality, setShowNationality] = useState(false)

  const { data: directors, isLoading } = useQuery({
    queryKey: ['organization-directors'],
    queryFn: () => directorsApi.list(),
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DirectorFormData>({
    resolver: zodResolver(directorSchema),
    defaultValues: {
      forenames: '',
      surname: '',
      formerName: '',
      isNonNigerian: false,
      nationality: '',
    },
  })

  const createMutation = useMutation({
    mutationFn: (data: DirectorFormData) => directorsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-directors'] })
      posthog.capture('organization_director_created')
      toast.success('Director added')
      closeModal()
    },
    onError: (error: any) => {
      toast.error('Failed to add director', {
        description: error.response?.data?.message,
      })
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: DirectorFormData) => directorsApi.update(editingDirector!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-directors'] })
      posthog.capture('organization_director_updated')
      toast.success('Director updated')
      closeModal()
    },
    onError: (error: any) => {
      toast.error('Failed to update director', {
        description: error.response?.data?.message,
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => directorsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-directors'] })
      posthog.capture('organization_director_deleted')
      toast.success('Director removed')
    },
    onError: (error: any) => {
      toast.error('Failed to remove director', {
        description: error.response?.data?.message,
      })
    },
  })

  const openCreateModal = () => {
    setEditingDirector(null)
    setShowFormerName(false)
    setShowNationality(false)
    reset({ forenames: '', surname: '', formerName: '', isNonNigerian: false, nationality: '' })
    setIsModalOpen(true)
  }

  const openEditModal = (director: Director) => {
    setEditingDirector(director)
    setShowFormerName(!!director.formerName)
    setShowNationality(director.isNonNigerian)
    reset({
      forenames: director.forenames,
      surname: director.surname,
      formerName: director.formerName || '',
      isNonNigerian: director.isNonNigerian,
      nationality: director.nationality || '',
    })
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingDirector(null)
    reset({ forenames: '', surname: '', formerName: '', isNonNigerian: false, nationality: '' })
  }

  const onSubmit = (data: DirectorFormData) => {
    const payload = {
      ...data,
      formerName: showFormerName ? data.formerName : undefined,
      isNonNigerian: showNationality,
      nationality: showNationality ? data.nationality : undefined,
    }
    if (editingDirector) {
      updateMutation.mutate(payload)
    } else {
      createMutation.mutate(payload)
    }
  }

  const handleDelete = (director: Director) => {
    if (window.confirm(`Remove ${director.forenames} ${director.surname} from your directors list?`)) {
      deleteMutation.mutate(director.id)
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="Directors"
        description="Manage CAC-registered directors shown on invoices"
        action={
          <Button onClick={openCreateModal}>
            <Plus className="mr-2 h-4 w-4" />
            Add Director
          </Button>
        }
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <p className="mb-4 max-w-2xl text-sm text-muted-foreground">
          CAC/CAMA 2020 requires business letters and invoices to show directors' present names, any former
          names, and the nationality of non-Nigerian directors. Directors added here appear automatically in
          the footer of every invoice PDF.
        </p>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : directors && directors.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {directors.map((director) => (
              <Card key={director.id}>
                <CardContent className="flex items-start justify-between p-4">
                  <div className="flex-1">
                    <h3 className="font-medium">
                      {director.forenames} {director.surname}
                    </h3>
                    {director.formerName && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Formerly {director.formerName}
                      </p>
                    )}
                    {director.isNonNigerian && director.nationality && (
                      <p className="mt-1 text-sm text-muted-foreground">{director.nationality}</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditModal(director)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(director)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">No directors added yet</p>
              <Button className="mt-4" onClick={openCreateModal}>
                Add your first director
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingDirector ? 'Edit Director' : 'New Director'}
        description={editingDirector ? 'Update director details' : 'Add a CAC-registered director'}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="forenames" required>First Name</Label>
              <Input
                id="forenames"
                placeholder="e.g., John A."
                {...register('forenames')}
                error={errors.forenames?.message}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="surname" required>Surname</Label>
              <Input
                id="surname"
                placeholder="e.g., Doe"
                {...register('surname')}
                error={errors.surname?.message}
              />
            </div>
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showFormerName}
                onChange={(e) => setShowFormerName(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <span className="text-sm font-medium">This person has a former name</span>
            </label>
            {showFormerName && (
              <div className="space-y-2">
                <Label htmlFor="formerName">Former Name</Label>
                <Input
                  id="formerName"
                  placeholder="e.g., Jonathan Doey"
                  {...register('formerName')}
                  error={errors.formerName?.message}
                />
              </div>
            )}
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showNationality}
                onChange={(e) => setShowNationality(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <span className="text-sm font-medium">Non-Nigerian director</span>
            </label>
            {showNationality && (
              <div className="space-y-2">
                <Label htmlFor="nationality">Nationality</Label>
                <Input
                  id="nationality"
                  placeholder="e.g., British"
                  {...register('nationality')}
                  error={errors.nationality?.message}
                />
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="submit"
              isLoading={createMutation.isPending || updateMutation.isPending}
            >
              {editingDirector ? 'Save Changes' : 'Add Director'}
            </Button>
            <Button type="button" variant="outline" onClick={closeModal}>
              Cancel
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
