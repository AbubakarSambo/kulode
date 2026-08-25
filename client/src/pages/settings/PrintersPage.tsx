import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Plus, Edit, Trash2, Printer as PrinterIcon, Copy, RefreshCw } from 'lucide-react'
import { Header } from '@/components/layout'
import { Button, Input, Label, Select, Card, CardContent, Badge } from '@/components/ui'
import { Modal } from '@/components/shared/Modal'
import { printersApi, menuCategoriesApi } from '@/api'
import type { Printer } from '@/api'

// ipAddress is intentionally optional, even for NETWORK printers — finding a printer's LAN IP
// is its own separate task (self-test page, router lookup, etc.), so admins can register the
// printer now and fill the address in once they've tracked it down. An unconfigured printer
// shows as "Not configured" on its card instead of blocking creation.
const printerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  station: z.string().min(1, 'Station is required'),
  connectionType: z.enum(['NETWORK', 'USB', 'BLUETOOTH']),
  ipAddress: z.string().optional(),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  devicePath: z.string().optional(),
})

type PrinterFormInput = z.input<typeof printerSchema>
type PrinterFormData = z.output<typeof printerSchema>

function PrintAgentSection() {
  const queryClient = useQueryClient()
  const [newToken, setNewToken] = useState<string | null>(null)

  const { data: status } = useQuery({
    queryKey: ['printers', 'agent-status'],
    queryFn: () => printersApi.getAgentStatus(),
  })

  const rotateMutation = useMutation({
    mutationFn: () => printersApi.rotateAgentToken(),
    onSuccess: ({ token }) => {
      setNewToken(token)
      queryClient.invalidateQueries({ queryKey: ['printers', 'agent-status'] })
    },
    onError: (error: any) => {
      toast.error('Failed to generate token', { description: error.response?.data?.message })
    },
  })

  const copyToken = () => {
    if (!newToken) return
    navigator.clipboard.writeText(newToken)
    toast.success('Token copied to clipboard')
  }

  return (
    <Card className="mb-4">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-medium">Print Agent</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Kulode's server can't reach printers directly over your restaurant's network — a small
              agent installed on a machine on-site relays print jobs to them. {status?.hasToken
                ? 'A token has already been generated.'
                : 'Generate a token to set it up.'}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            isLoading={rotateMutation.isPending}
            onClick={() => {
              if (status?.hasToken && !window.confirm('Regenerating will disconnect any agent currently running with the old token until it is reconfigured. Continue?')) {
                return
              }
              rotateMutation.mutate()
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {status?.hasToken ? 'Regenerate Token' : 'Generate Token'}
          </Button>
        </div>

        {newToken && (
          <div className="mt-4 rounded-lg border border-[rgba(196,197,215,0.4)] bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">
              Copy this now — it won't be shown again. Put it in the print agent's <code>.env</code> file as{' '}
              <code>KULODE_PRINT_AGENT_TOKEN</code>.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded bg-background px-2 py-1.5 text-xs">{newToken}</code>
              <Button variant="ghost" size="icon" onClick={copyToken}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function PrintersPage() {
  const queryClient = useQueryClient()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingPrinter, setEditingPrinter] = useState<Printer | null>(null)
  const [categoriesPrinter, setCategoriesPrinter] = useState<Printer | null>(null)
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])

  const { data: printers, isLoading } = useQuery({
    queryKey: ['printers'],
    queryFn: () => printersApi.list(),
  })

  const { data: categories } = useQuery({
    queryKey: ['menu-categories'],
    queryFn: () => menuCategoriesApi.list(),
  })

  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    formState: { errors },
  } = useForm<PrinterFormInput, unknown, PrinterFormData>({
    resolver: zodResolver(printerSchema),
    defaultValues: { name: '', station: '', connectionType: 'NETWORK', ipAddress: '', port: 9100, devicePath: '' },
  })

  const connectionType = watch('connectionType')

  const createMutation = useMutation({
    mutationFn: (data: PrinterFormData) => printersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['printers'] })
      toast.success('Printer added')
      closeModal()
    },
    onError: (error: any) => {
      toast.error('Failed to add printer', { description: error.response?.data?.message })
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: PrinterFormData) => printersApi.update(editingPrinter!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['printers'] })
      toast.success('Printer updated')
      closeModal()
    },
    onError: (error: any) => {
      toast.error('Failed to update printer', { description: error.response?.data?.message })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => printersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['printers'] })
      toast.success('Printer removed')
    },
    onError: (error: any) => {
      toast.error('Failed to remove printer', { description: error.response?.data?.message })
    },
  })

  const setCategoriesMutation = useMutation({
    mutationFn: ({ id, categoryIds }: { id: string; categoryIds: string[] }) =>
      printersApi.setCategories(id, categoryIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['printers'] })
      toast.success('Printer routing updated')
      setCategoriesPrinter(null)
    },
    onError: (error: any) => {
      toast.error('Failed to update printer routing', { description: error.response?.data?.message })
    },
  })

  const openCreateModal = () => {
    setEditingPrinter(null)
    reset({ name: '', station: '', connectionType: 'NETWORK', ipAddress: '', port: 9100, devicePath: '' })
    setIsModalOpen(true)
  }

  const openEditModal = (printer: Printer) => {
    setEditingPrinter(printer)
    reset({
      name: printer.name,
      station: printer.station,
      connectionType: printer.connectionType,
      ipAddress: printer.ipAddress ?? '',
      port: printer.port ?? 9100,
      devicePath: printer.devicePath ?? '',
    })
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingPrinter(null)
  }

  const onSubmit = (data: PrinterFormData) => {
    if (editingPrinter) {
      updateMutation.mutate(data)
    } else {
      createMutation.mutate(data)
    }
  }

  const handleDelete = (printer: Printer) => {
    if (window.confirm(`Remove "${printer.name}"? It will stop receiving dockets.`)) {
      deleteMutation.mutate(printer.id)
    }
  }

  const openCategoriesModal = (printer: Printer) => {
    setCategoriesPrinter(printer)
    setSelectedCategoryIds(printer.categories.map((c) => c.categoryId))
  }

  const toggleCategory = (categoryId: string) => {
    setSelectedCategoryIds((prev) =>
      prev.includes(categoryId) ? prev.filter((id) => id !== categoryId) : [...prev, categoryId],
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="Printers"
        description="Configure kitchen and bar printers so tickets print automatically when an order is placed"
        action={
          <Button onClick={openCreateModal}>
            <Plus className="mr-2 h-4 w-4" />
            Add Printer
          </Button>
        }
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <PrintAgentSection />
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : printers && printers.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {printers.map((printer) => (
              <Card key={printer.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <PrinterIcon className="h-4 w-4 text-muted-foreground" />
                        <h3 className="font-medium">{printer.name}</h3>
                        {!printer.isActive && <Badge variant="secondary">Inactive</Badge>}
                        {printer.connectionType === 'NETWORK' && !printer.ipAddress && (
                          <Badge variant="warning">Not configured</Badge>
                        )}
                        {printer.connectionType !== 'NETWORK' && !printer.devicePath && (
                          <Badge variant="warning">Not configured</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{printer.station}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {printer.connectionType}
                        {printer.connectionType === 'NETWORK'
                          ? printer.ipAddress
                            ? ` · ${printer.ipAddress}:${printer.port ?? 9100}`
                            : ' · no IP address yet'
                          : printer.devicePath
                            ? ` · \\\\localhost\\${printer.devicePath}`
                            : ' · no share name yet'}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {printer.categories.length === 0
                          ? 'Prints every order (broadcast)'
                          : `Routes: ${printer.categories.map((c) => c.category.name).join(', ')}`}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEditModal(printer)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(printer)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 w-full"
                    onClick={() => openCategoriesModal(printer)}
                  >
                    Manage routing
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">No printers configured yet</p>
              <Button className="mt-4" onClick={openCreateModal}>
                Add your first printer
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingPrinter ? 'Edit Printer' : 'New Printer'}
        description="A printer with no category routing prints every order placed"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name" required>Name</Label>
            <Input id="name" placeholder="e.g., Kitchen Printer" {...register('name')} error={errors.name?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="station" required>Station</Label>
            <Input id="station" placeholder="e.g., Kitchen, Bar, Expo" {...register('station')} error={errors.station?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="connectionType" required>Connection</Label>
            <Controller
              name="connectionType"
              control={control}
              render={({ field }) => (
                <Select id="connectionType" {...field}>
                  <option value="NETWORK">Network (WiFi/Ethernet)</option>
                  <option value="USB">USB</option>
                  <option value="BLUETOOTH">Bluetooth</option>
                </Select>
              )}
            />
          </div>

          {connectionType === 'NETWORK' && (
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-2">
                <Label htmlFor="ipAddress">IP Address</Label>
                <Input id="ipAddress" placeholder="192.168.1.50" {...register('ipAddress')} error={errors.ipAddress?.message} />
                <p className="text-xs text-muted-foreground">
                  Don't have it yet? Save without one and come back once you've found it — it just won't print until then.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="port">Port</Label>
                <Input id="port" type="number" placeholder="9100" {...register('port')} error={errors.port?.message} />
              </div>
            </div>
          )}

          {connectionType !== 'NETWORK' && (
            <div className="space-y-2">
              <Label htmlFor="devicePath">Windows Share Name</Label>
              <Input
                id="devicePath"
                placeholder="e.g. XP80C"
                {...register('devicePath')}
                error={errors.devicePath?.message}
              />
              <p className="text-xs text-muted-foreground">
                The machine this printer is plugged into (via {connectionType === 'USB' ? 'USB' : 'Bluetooth'}) must
                run the print agent on Windows, with this printer shared (Printer Properties &gt; Sharing &gt; Share
                this printer). Enter that share name here — don't have it set up yet? Save without one for now.
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="submit" isLoading={createMutation.isPending || updateMutation.isPending}>
              {editingPrinter ? 'Save Changes' : 'Add Printer'}
            </Button>
            <Button type="button" variant="outline" onClick={closeModal}>
              Cancel
            </Button>
          </div>
        </form>
      </Modal>

      {/* Category routing Modal */}
      <Modal
        isOpen={!!categoriesPrinter}
        onClose={() => setCategoriesPrinter(null)}
        title={`Routing for ${categoriesPrinter?.name ?? ''}`}
        description="Select which menu categories print to this printer. Leave everything unchecked to make it a broadcast printer that prints every order."
      >
        <div className="space-y-2 max-h-80 overflow-auto">
          {categories && categories.length > 0 ? (
            categories.map((category) => (
              <label key={category.id} className="flex items-center gap-2 rounded-lg border border-[rgba(196,197,215,0.4)] p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedCategoryIds.includes(category.id)}
                  onChange={() => toggleCategory(category.id)}
                />
                <span className="text-sm font-medium">{category.name}</span>
              </label>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No menu categories yet</p>
          )}
        </div>
        <div className="flex gap-3 pt-4">
          <Button
            isLoading={setCategoriesMutation.isPending}
            onClick={() =>
              categoriesPrinter &&
              setCategoriesMutation.mutate({ id: categoriesPrinter.id, categoryIds: selectedCategoryIds })
            }
          >
            Save Routing
          </Button>
          <Button type="button" variant="outline" onClick={() => setCategoriesPrinter(null)}>
            Cancel
          </Button>
        </div>
      </Modal>
    </div>
  )
}
