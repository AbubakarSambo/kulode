import React, { useState, useEffect, useRef } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import type { FieldErrors } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  PlusSignIcon,
  Delete02Icon,
  ArrowDown01Icon,
  Search01Icon,
  AlertCircleIcon,
  UserIcon,
  Note01Icon,
  Invoice03Icon,
  PercentCircleIcon,
  LicenseIcon,
  EyeIcon,
  Briefcase02Icon,
  PackageIcon,
  Cancel01Icon,
} from '@hugeicons/core-free-icons'
import { Header } from '@/components/layout'
import { Button, Input, Label, Textarea, Card, CardContent, CardHeader, CardTitle, DatePicker } from '@/components/ui'
import { clientsApi, invoicesApi, organizationsApi, inventoryApi } from '@/api'
import type { CreateInventoryItemData } from '@/api/inventory'
import { cn, formatCurrency } from '@/lib/utils'
import { posthog } from '@/lib/posthog'
import type { Client, ServiceItem, InventoryItem, Organization } from '@/types'

function CreateClientModal({
  isOpen,
  onClose,
  onSuccess,
  initialName = '',
}: {
  isOpen: boolean
  onClose: () => void
  onSuccess: (clientId: string) => void
  initialName?: string
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(initialName)
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [validationError, setValidationError] = useState('')

  const createMutation = useMutation({
    mutationFn: () =>
      clientsApi.create({ name: name.trim(), email: email.trim() || undefined, phone: phone.trim() || undefined }),
    onSuccess: (client) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] })
      posthog.capture('client_created', { client_id: client.id, source: 'invoice_form_modal' })
      toast.success('Client created', { description: `${client.name} has been added` })
      onSuccess(client.id)
      onClose()
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (err: any) => {
      toast.error('Failed to create client', { description: err.response?.data?.message || 'Please try again' })
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setValidationError('Name is required')
      return
    }
    createMutation.mutate()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300"
        onClick={createMutation.isPending ? undefined : onClose}
      />

      {/* Modal Dialog Card */}
      <div className="relative w-full max-w-md transform overflow-hidden rounded-[28px] bg-white border border-slate-200/40 p-6 shadow-[0px_12px_32px_rgba(0,55,176,0.12)] transition-all animate-in fade-in zoom-in-95 duration-200 z-50">
        
        {/* Close Button */}
        {!createMutation.isPending && (
          <button
            onClick={onClose}
            className="absolute right-5 top-5 rounded-full p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-all cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.5} />
          </button>
        )}

        {/* Content */}
        <div className="mt-2 text-left">
          <h3 className="text-lg font-black text-slate-905 leading-tight flex items-center gap-2">
            <HugeiconsIcon icon={UserIcon} size={20} strokeWidth={1.5} className="text-[#0037b0]" />
            New Client
          </h3>
          <p className="mt-1.5 text-xs font-semibold text-slate-400">
            Add a new customer profile.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-1.5 text-left">
            <Label required htmlFor="modal-client-name" className="text-slate-500 font-semibold">Client Name</Label>
            <Input
              id="modal-client-name"
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (validationError) setValidationError('')
              }}
              placeholder="e.g. Dangote Group"
              className="h-11 rounded-xl"
              error={validationError}
            />
          </div>

          <div className="space-y-1.5 text-left">
            <Label htmlFor="modal-client-email" className="text-slate-500 font-semibold">Email Address (Optional)</Label>
            <Input
              id="modal-client-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. finance@dangote.com"
              className="h-11 rounded-xl"
            />
          </div>

          <div className="space-y-1.5 text-left">
            <Label htmlFor="modal-client-phone" className="text-slate-500 font-semibold">Phone Number (Optional)</Label>
            <Input
              id="modal-client-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. +234 803 123 4567"
              className="h-11 rounded-xl"
            />
          </div>

          <p className="text-[11px] text-slate-400 font-medium text-left">
            Additional details (like address and billing settings) can be configured on the Clients page later.
          </p>

          {/* Footer Actions */}
          <div className="pt-2 flex flex-row items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={createMutation.isPending}
              onClick={onClose}
              className="px-5 h-11 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-655 min-h-[44px]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || createMutation.isPending}
              className="px-5 h-11 rounded-xl bg-gradient-to-r from-[#0037b0] to-[#1d4ed8] text-white text-xs font-extrabold shadow-md shadow-[#0037b0]/10 active:scale-98 transition-all min-h-[44px] border-0"
              isLoading={createMutation.isPending}
            >
              Create Client
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CreateItemModal({
  isOpen,
  onClose,
  onSuccess,
  initialKind = 'service',
  initialName = '',
}: {
  isOpen: boolean
  onClose: () => void
  onSuccess: (selection: { kind: 'service' | 'inventory'; id: string; item: ServiceItem | InventoryItem }) => void
  initialKind?: 'service' | 'inventory'
  initialName?: string
}) {
  const queryClient = useQueryClient()
  const [kind, setKind] = useState<'service' | 'inventory'>(initialKind)
  const [name, setName] = useState(initialName)
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('')
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  const createServiceMutation = useMutation({
    mutationFn: () =>
      invoicesApi.createServiceItem({ name: name.trim(), unitPrice: parseFloat(price) }),
    onSuccess: (item) => {
      queryClient.invalidateQueries({ queryKey: ['service-items'] })
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] })
      toast.success('Service created', { description: item.name })
      onSuccess({ kind: 'service', id: item.id, item })
      onClose()
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (err: any) => {
      toast.error('Failed to create service', { description: err.response?.data?.message || 'Please try again' })
    },
  })

  const createInventoryMutation = useMutation({
    mutationFn: () => {
      const data: CreateInventoryItemData = { name: name.trim(), unitPrice: parseFloat(price) }
      if (stock) data.initialStock = parseInt(stock)
      return inventoryApi.create(data)
    },
    onSuccess: (item) => {
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] })
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] })
      toast.success('Product created', { description: item.name })
      onSuccess({ kind: 'inventory', id: item.id, item })
      onClose()
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (err: any) => {
      toast.error('Failed to create product', { description: err.response?.data?.message || 'Please try again' })
    },
  })

  const isPending = createServiceMutation.isPending || createInventoryMutation.isPending

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const errors: Record<string, string> = {}
    if (!name.trim()) {
      errors.name = 'Name is required'
    }
    if (!price || parseFloat(price) < 0) {
      errors.price = 'Price must be 0 or greater'
    }
    if (kind === 'inventory' && stock && parseInt(stock) < 0) {
      errors.stock = 'Stock must be 0 or greater'
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors)
      return
    }

    if (kind === 'service') {
      createServiceMutation.mutate()
    } else {
      createInventoryMutation.mutate()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300"
        onClick={isPending ? undefined : onClose}
      />

      {/* Modal Dialog Card */}
      <div className="relative w-full max-w-md transform overflow-hidden rounded-[28px] bg-white border border-slate-200/40 p-6 shadow-[0px_12px_32px_rgba(0,55,176,0.12)] transition-all animate-in fade-in zoom-in-95 duration-200 z-50">
        
        {/* Close Button */}
        {!isPending && (
          <button
            onClick={onClose}
            className="absolute right-5 top-5 rounded-full p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-all cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.5} />
          </button>
        )}

        {/* Content */}
        <div className="mt-2 text-left">
          <h3 className="text-lg font-black text-slate-900 leading-tight flex items-center gap-2">
            <HugeiconsIcon icon={kind === 'service' ? Briefcase02Icon : PackageIcon} size={20} strokeWidth={1.5} className="text-[#0037b0]" />
            New {kind === 'service' ? 'Service' : 'Product'}
          </h3>
          <p className="mt-1.5 text-xs font-semibold text-slate-400">
            Create a new item catalog item.
          </p>
        </div>

        {/* Tabs for Kind */}
        <div className="mt-5 flex rounded-xl bg-slate-100 p-1 border border-slate-200/40">
          <button
            type="button"
            disabled={isPending}
            onClick={() => setKind('service')}
            className={cn(
              "flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5",
              kind === 'service'
                ? "bg-white text-[#0037b0] shadow-sm"
                : "text-slate-500 hover:text-[#0037b0]"
            )}
          >
            <HugeiconsIcon icon={Briefcase02Icon} size={14} strokeWidth={1.5} />
            Service
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => setKind('inventory')}
            className={cn(
              "flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5",
              kind === 'inventory'
                ? "bg-white text-[#0037b0] shadow-sm"
                : "text-slate-500 hover:text-[#0037b0]"
            )}
          >
            <HugeiconsIcon icon={PackageIcon} size={14} strokeWidth={1.5} />
            Product
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="space-y-1.5 text-left">
            <Label required htmlFor="modal-item-name" className="text-slate-500 font-semibold">Name</Label>
            <Input
              id="modal-item-name"
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (validationErrors.name) setValidationErrors(prev => { const copy = { ...prev }; delete copy.name; return copy })
              }}
              placeholder={kind === 'service' ? "e.g. Financial Consulting" : "e.g. Office Chair"}
              className="h-11 rounded-xl"
              error={validationErrors.name}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 text-left">
              <Label required htmlFor="modal-item-price" className="text-slate-500 font-semibold">Unit Price</Label>
              <Input
                id="modal-item-price"
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={(e) => {
                  setPrice(e.target.value)
                  if (validationErrors.price) setValidationErrors(prev => { const copy = { ...prev }; delete copy.price; return copy })
                }}
                placeholder="0.00"
                className="h-11 rounded-xl"
                error={validationErrors.price}
              />
            </div>

            {kind === 'inventory' && (
              <div className="space-y-1.5 text-left">
                <Label htmlFor="modal-item-stock" className="text-slate-500 font-semibold">Initial Stock</Label>
                <Input
                  id="modal-item-stock"
                  type="number"
                  min="0"
                  value={stock}
                  onChange={(e) => {
                    setStock(e.target.value)
                    if (validationErrors.stock) setValidationErrors(prev => { const copy = { ...prev }; delete copy.stock; return copy })
                  }}
                  placeholder="0"
                  className="h-11 rounded-xl"
                  error={validationErrors.stock}
                />
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="pt-2 flex flex-row items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={onClose}
              className="px-5 h-11 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-655 min-h-[44px]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || !price || isPending}
              className="px-5 h-11 rounded-xl bg-gradient-to-r from-[#0037b0] to-[#1d4ed8] text-white text-xs font-extrabold shadow-md shadow-[#0037b0]/10 active:scale-98 transition-all min-h-[44px] border-0"
              isLoading={isPending}
            >
              Create Item
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function InvoicePreviewModal({
  isOpen,
  onClose,
  formData,
  clients,
  organization,
  onSubmit,
  isPending,
}: {
  isOpen: boolean
  onClose: () => void
  formData: InvoiceFormData
  clients: Client[]
  organization?: Organization | null
  onSubmit: () => void
  isPending: boolean
}) {
  if (!isOpen) return null

  const client = clients.find(c => c.id === formData.clientId)
  
  // Calculate Totals
  const subtotal = (formData.items || []).reduce((sum: number, item) => {
    return sum + (Number(item?.quantity) || 0) * (Number(item?.unitPrice) || 0)
  }, 0)
  
  const discountAmount = formData.discountType === 'FIXED'
    ? Math.min(Number(formData.discountPercent) || 0, subtotal)
    : subtotal * ((Number(formData.discountPercent) || 0) / 100)
    
  const afterDiscount = subtotal - discountAmount
  const vatEnabled = organization?.vatEnabled ?? false
  const orgTaxRate = organization?.taxRate ?? 0
  const vat = vatEnabled && orgTaxRate > 0 ? afterDiscount * (orgTaxRate / 100) : 0
  const total = afterDiscount + vat

  const displayDate = (dateStr: string) => {
    if (!dateStr) return ''
    const parts = dateStr.split('-')
    if (parts.length !== 3) return dateStr
    const [year, month, day] = parts
    return `${day}/${month}/${year}`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300"
        onClick={isPending ? undefined : onClose}
      />

      {/* Modal Dialog Card */}
      <div className="relative w-full max-w-3xl transform overflow-hidden rounded-[28px] bg-[#f8f9ff] border border-slate-200/40 shadow-[0px_16px_48px_rgba(0,55,176,0.16)] transition-all animate-in fade-in zoom-in-95 duration-200 z-50 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-white px-6 py-4 flex items-center justify-between border-b border-slate-200/40 shrink-0">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <HugeiconsIcon icon={Invoice03Icon} size={18} strokeWidth={1.5} className="text-[#0037b0]" />
              Invoice Preview
            </h3>
            <p className="text-[11px] font-semibold text-slate-400 mt-0.5">
              Review how the final invoice sheet will look to your client.
            </p>
          </div>
          {!isPending && (
            <button
              onClick={onClose}
              className="rounded-full p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-all cursor-pointer min-h-[44px]"
              aria-label="Close"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.5} />
            </button>
          )}
        </div>

        {/* Scrollable Preview Area */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          
          {/* Main Invoice Sheet */}
          <div className="mx-auto max-w-2xl bg-white rounded-3xl p-6 md:p-10 shadow-[0px_8px_30px_rgba(0,55,176,0.04)] border border-[#eef4ff]/50 relative overflow-hidden text-left">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#0037b0] to-[#1d4ed8]" />
            
            {/* Document Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-8 mt-2 pb-6 border-b border-[#eef4ff]/40">
              <div>
                <h2 className="text-sm font-extrabold tracking-tight text-slate-800 uppercase">
                  {organization?.name || 'Acme Corporation'}
                </h2>
                <p className="text-[11px] text-slate-400 mt-1">Corporate Invoice</p>
              </div>
              <div className="sm:text-right">
                <span className="text-[9px] font-bold uppercase tracking-widest text-[#0037b0] bg-[#0037b0]/5 px-2.5 py-1 rounded-md">
                  DRAFT PREVIEW
                </span>
                <h1 className="text-lg font-bold tracking-tight text-slate-900 mt-2">INV-XXXXXX</h1>
              </div>
            </div>

            {/* Bilateral Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
              <div className="bg-background/50 p-4 rounded-2xl border border-[#eef4ff]/30">
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 block mb-2">Billed To</span>
                <span className="text-sm font-bold text-[#0037b0] block truncate max-w-[280px]">
                  {client?.name || 'Select a client'}
                </span>
                {client?.email && (
                  <span className="text-xs text-slate-500 block mt-1 truncate max-w-[280px]">{client.email}</span>
                )}
                {client?.phone && (
                  <span className="text-xs text-slate-500 block mt-0.5">{client.phone}</span>
                )}
              </div>
              <div className="bg-background/50 p-4 rounded-2xl border border-[#eef4ff]/30 sm:text-right flex flex-col justify-between gap-3">
                <div>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 block mb-0.5">Issue Date</span>
                  <span className="text-xs font-bold text-slate-750">{displayDate(formData.issueDate)}</span>
                </div>
                <div>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 block mb-0.5">Due Date</span>
                  <span className="text-xs font-bold text-rose-600">{displayDate(formData.dueDate)}</span>
                </div>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="pt-2">
              {/* Desktop Table View */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full min-w-[400px]">
                  <thead>
                    <tr className="text-xs font-bold uppercase tracking-widest text-slate-400 border-b border-[#eef4ff]/40">
                      <th className="pb-3 text-left font-bold">Description</th>
                      <th className="pb-3 text-right font-bold w-16">Qty</th>
                      <th className="pb-3 text-right font-bold w-32">Price</th>
                      <th className="pb-3 text-right font-bold w-32">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-0">
                    {(formData.items || []).map((item, index: number) => {
                      const qty = Number(item.quantity) || 0
                      const price = Number(item.unitPrice) || 0
                      const amount = qty * price

                      return (
                        <tr 
                          key={index} 
                          className={cn(
                            "transition-colors border-b border-[#eef4ff]/25 last:border-b-0",
                            index % 2 === 0 ? "bg-transparent" : "bg-background/30"
                          )}
                        >
                          <td className="py-4 text-sm font-medium text-slate-800 max-w-[200px] truncate">{item.description || 'No description'}</td>
                          <td className="py-4 text-right text-sm font-medium text-slate-650 tabular-nums">{qty}</td>
                          <td className="py-4 text-right text-sm font-medium text-slate-650 tabular-nums">{formatCurrency(price)}</td>
                          <td className="py-4 text-right text-sm font-bold text-slate-900 tabular-nums">{formatCurrency(amount)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Vertical List View */}
              <div className="block sm:hidden space-y-3 pb-4">
                <p className="text-[9px] font-bold tracking-widest text-slate-450 uppercase mb-2">Invoice Items</p>
                {(formData.items || []).map((item, index: number) => {
                  const qty = Number(item.quantity) || 0
                  const price = Number(item.unitPrice) || 0
                  const amount = qty * price

                  return (
                    <div 
                      key={index}
                      className="p-4 rounded-2xl bg-background/40 border border-[#eef4ff]/20 flex flex-col gap-2"
                    >
                      <p className="text-xs font-bold text-slate-700 leading-tight">
                        {item.description || 'No description'}
                      </p>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-455 font-semibold">
                          {qty} x {formatCurrency(price)}
                        </span>
                        <span className="font-bold text-slate-850 tabular-nums">
                          {formatCurrency(amount)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Totals Section */}
              <table className="w-full border-t border-[#eef4ff]/50">
                <tbody className="divide-y-0">
                  <tr>
                    <td className="py-3 text-left sm:text-right text-xs font-bold uppercase tracking-wider text-slate-400 sm:pr-32">Subtotal</td>
                    <td className="py-3 text-right text-sm font-bold text-slate-900 tabular-nums w-32">{formatCurrency(subtotal)}</td>
                  </tr>
                  {discountAmount > 0 && (
                    <tr className="text-emerald-600">
                      <td className="py-1.5 text-left sm:text-right text-xs font-bold uppercase tracking-wider sm:pr-32">Discount {formData.discountType === 'PERCENTAGE' ? `(${formData.discountPercent}%)` : ''}</td>
                      <td className="py-1.5 text-right text-sm font-bold tabular-nums w-32">-{formatCurrency(discountAmount)}</td>
                    </tr>
                  )}
                  {vatEnabled && orgTaxRate > 0 && (
                    <tr className="text-slate-500">
                      <td className="py-1.5 text-left sm:text-right text-xs font-bold uppercase tracking-wider text-slate-400 sm:pr-32">VAT ({orgTaxRate}%)</td>
                      <td className="py-1.5 text-right text-sm font-semibold text-slate-705 tabular-nums w-32">{formatCurrency(vat)}</td>
                    </tr>
                  )}
                  <tr className="border-t border-[#eef4ff]/60 bg-[#0037b0]/02">
                    <td className="py-4 text-left sm:text-right text-xs font-bold uppercase tracking-wider text-slate-700 sm:pr-32">Total</td>
                    <td className="py-4 text-right text-lg font-bold text-slate-900 tabular-nums w-32">{formatCurrency(total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Notes */}
            {formData.notes && (
              <div className="border-t border-[#eef4ff]/30 pt-4 mt-8">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Notes</p>
                <p className="mt-2 text-xs font-medium text-slate-650 leading-relaxed bg-background/50 p-4 rounded-xl border border-[#eef4ff]/30">{formData.notes}</p>
              </div>
            )}

            {/* Terms */}
            {formData.terms && (
              <div className="border-t border-[#eef4ff]/30 pt-4 mt-4">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Terms & Conditions</p>
                <p className="mt-2 text-xs font-medium text-slate-655 leading-relaxed bg-background/50 p-4 rounded-xl border border-[#eef4ff]/30">{formData.terms}</p>
              </div>
            )}

          </div>

        </div>

        {/* Footer Actions */}
        <div className="bg-white px-6 py-4 flex items-center justify-between border-t border-slate-200/40 shrink-0">
          <div className="hidden sm:flex flex-col text-left">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Amount</span>
            <span className="text-base font-extrabold text-[#0037b0] tabular-nums">{formatCurrency(total)}</span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={onClose}
              className="flex-1 sm:flex-initial h-11 px-6 rounded-xl font-bold border-slate-200 text-slate-655 min-h-[44px]"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isPending}
              onClick={() => {
                onSubmit()
              }}
              className="flex-1 sm:flex-initial h-11 px-8 rounded-xl font-bold bg-[#0037b0] hover:bg-[#0037b0]/90 text-white shadow-md shadow-[#0037b0]/15 border-0 min-h-[44px]"
              isLoading={isPending}
            >
              Confirm & Create
            </Button>
          </div>
        </div>

      </div>
    </div>
  )
}

function ClientCombobox({
  clients,
  value,
  onChange,
  error,
  triggerRef,
  onCreateClientClick,
}: {
  clients: Client[]
  value: string
  onChange: (clientId: string) => void
  error?: string
  triggerRef?: React.RefObject<HTMLButtonElement | null>
  onCreateClientClick: (initialName: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selected = clients.find((c) => c.id === value)
  const filtered = clients.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))

  function openDropdown() {
    setOpen(true)
    setQuery('')
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function startCreating() {
    setOpen(false)
    onCreateClientClick(query)
    setQuery('')
  }

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={openDropdown}
        className={`flex h-11 w-full items-center justify-between rounded-xl border bg-background px-4 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground ${error ? 'border-destructive' : 'border-input'}`}
      >
        {selected ? (
          <span className="truncate font-medium text-slate-800">{selected.name}</span>
        ) : (
          <span className="text-muted-foreground">Select a client</span>
        )}
        <HugeiconsIcon icon={ArrowDown01Icon} size={16} strokeWidth={1.5} className="ml-2 shrink-0 opacity-50 text-slate-400" />
      </button>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-2xl border border-slate-200 bg-card shadow-lg">
          <div className="flex items-center border-b px-3">
            <HugeiconsIcon icon={Search01Icon} size={16} strokeWidth={1.5} className="mr-2 shrink-0 opacity-50 text-slate-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search clients..."
              className="flex h-11 w-full bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1.5 space-y-0.5">
            {filtered.length > 0 ? (
              filtered.map((client) => (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => { onChange(client.id); setOpen(false); setQuery('') }}
                  className={cn(
                    "flex w-full flex-col justify-start rounded-lg px-3.5 py-2.5 text-left hover:bg-slate-50 transition-colors cursor-pointer border-0",
                    client.id === value && "bg-[#0037b0]/5 text-[#0037b0]"
                  )}
                >
                  <span className="text-sm font-bold text-slate-850 tracking-tight">{client.name}</span>
                  {(client.email || client.phone) && (
                    <span className="text-[11px] text-slate-400 font-medium mt-0.5 truncate max-w-full">
                      {client.email}{client.email && client.phone ? ' • ' : ''}{client.phone}
                    </span>
                  )}
                </button>
              ))
            ) : (
              <p className="px-2 py-4 text-center text-xs font-semibold text-slate-400">
                {query ? `No clients matching "${query}"` : 'No clients yet'}
              </p>
            )}
            <div className="border-t border-slate-100 mt-1 pt-1.5">
              <button
                type="button"
                onClick={startCreating}
                className="flex w-full items-center gap-2 rounded-lg px-3.5 py-2.5 text-xs text-[#0037b0] hover:bg-slate-50 transition-colors font-bold cursor-pointer border-0 bg-transparent"
              >
                <HugeiconsIcon icon={PlusSignIcon} size={14} strokeWidth={1.5} />
                {query ? `Create Client "${query}"` : 'New client'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ItemCombobox({
  serviceItems,
  inventoryItems,
  onSelect,
  value,
  onCreateItemClick,
}: {
  serviceItems: ServiceItem[]
  inventoryItems: InventoryItem[]
  onSelect: (selection: { kind: 'service'; id: string; item?: ServiceItem } | { kind: 'inventory'; id: string; item?: InventoryItem } | { kind: 'custom' }) => void
  value?: { serviceItemId?: string; inventoryItemId?: string }
  onCreateItemClick: (kind: 'service' | 'inventory', initialName: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selected = (() => {
    if (!value) return null
    if (value.serviceItemId) {
      const item = serviceItems.find(i => i.id === value.serviceItemId)
      return item ? { kind: 'service' as const, item } : null
    }
    if (value.inventoryItemId) {
      const item = inventoryItems.find(i => i.id === value.inventoryItemId)
      return item ? { kind: 'inventory' as const, item } : null
    }
    return null
  })()

  const q = query.toLowerCase()
  const filteredServices = serviceItems.filter((i) => i.name.toLowerCase().includes(q))
  const filteredInventory = inventoryItems.filter((i) => i.name.toLowerCase().includes(q))
  const hasResults = filteredServices.length > 0 || filteredInventory.length > 0

  const selectedLabel = selected
    ? selected.kind === 'service'
      ? `${selected.item.name} — ${formatCurrency(selected.item.unitPrice)}`
      : `${selected.item.name} — ${formatCurrency((selected.item as InventoryItem).unitPrice)}`
    : null

  function startCreating(kind: 'service' | 'inventory') {
    setOpen(false)
    onCreateItemClick(kind, query)
    setQuery('')
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(!open); setQuery('') }}
        className="flex h-11 w-full items-center justify-between rounded-xl border border-input bg-background px-4 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        {selectedLabel ? (
          <span className="truncate font-medium text-slate-800">{selectedLabel}</span>
        ) : (
          <span className="text-muted-foreground">Select item...</span>
        )}
        <HugeiconsIcon icon={ArrowDown01Icon} size={16} strokeWidth={1.5} className="ml-2 shrink-0 opacity-50 text-slate-400" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-2xl border border-slate-200 bg-card shadow-lg">
          <div className="flex items-center border-b px-3">
            <HugeiconsIcon icon={Search01Icon} size={16} strokeWidth={1.5} className="mr-2 shrink-0 opacity-50 text-slate-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search items..."
              className="flex h-11 w-full bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1.5 space-y-0.5">
            {filteredServices.length > 0 && (
              <>
                <p className="px-3.5 py-1.5 text-[10px] font-bold text-slate-450 uppercase tracking-widest flex items-center gap-1.5 select-none text-left">
                  <HugeiconsIcon icon={Briefcase02Icon} size={12} strokeWidth={1.5} />
                  Services
                </p>
                {filteredServices.map((item) => {
                  const isSelected = value?.serviceItemId === item.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onSelect({ kind: 'service', id: item.id, item })
                        setOpen(false)
                        setQuery('')
                      }}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg px-3.5 py-2.5 text-xs transition-colors hover:bg-slate-50 cursor-pointer text-left border-0 bg-transparent",
                        isSelected && "bg-[#0037b0]/5 text-[#0037b0] font-semibold"
                      )}
                    >
                      <span className="font-bold text-slate-800 truncate max-w-[200px]">{item.name}</span>
                      <span className="text-[#0037b0] font-bold bg-[#eef4ff] px-2.5 py-1 rounded-full text-[10px] tabular-nums shrink-0 ml-2">
                        {formatCurrency(item.unitPrice)}
                      </span>
                    </button>
                  )
                })}
              </>
            )}

            {filteredInventory.length > 0 && (
              <>
                <p className="px-3.5 py-1.5 text-[10px] font-bold text-slate-455 uppercase tracking-widest flex items-center gap-1.5 mt-2 select-none text-left">
                  <HugeiconsIcon icon={PackageIcon} size={12} strokeWidth={1.5} />
                  Products
                </p>
                {filteredInventory.map((item) => {
                  const isSelected = value?.inventoryItemId === item.id
                  const isLowStock = item.availableQuantity <= 5
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onSelect({ kind: 'inventory', id: item.id, item })
                        setOpen(false)
                        setQuery('')
                      }}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg px-3.5 py-2.5 text-xs transition-colors hover:bg-slate-50 cursor-pointer text-left border-0 bg-transparent",
                        isSelected && "bg-[#0037b0]/5 text-[#0037b0] font-semibold"
                      )}
                    >
                      <div className="flex flex-col text-left">
                        <span className="font-bold text-slate-800 truncate max-w-[180px]">{item.name}</span>
                        <span className={cn(
                          "text-[10px] font-semibold mt-0.5",
                          isLowStock ? "text-amber-600 font-bold" : "text-slate-400"
                        )}>
                          {item.availableQuantity} available
                        </span>
                      </div>
                      <span className="text-[#0037b0] font-bold bg-[#eef4ff] px-2.5 py-1 rounded-full text-[10px] tabular-nums shrink-0 ml-2">
                        {formatCurrency(item.unitPrice)}
                      </span>
                    </button>
                  )
                })}
              </>
            )}

            {!hasResults && (
              <p className="px-2 py-4 text-center text-xs font-semibold text-slate-400">No items found</p>
            )}

            <div className="border-t border-slate-100 mt-2 pt-1.5 space-y-0.5">
              <button
                type="button"
                onClick={() => startCreating('service')}
                className="flex w-full items-center gap-2 rounded-lg px-3.5 py-2.5 text-xs text-[#0037b0] hover:bg-slate-50 transition-colors font-bold cursor-pointer border-0 bg-transparent"
              >
                <HugeiconsIcon icon={PlusSignIcon} size={14} strokeWidth={1.5} />
                {query ? `New service "${query}"` : 'New service'}
              </button>
              <button
                type="button"
                onClick={() => startCreating('inventory')}
                className="flex w-full items-center gap-2 rounded-lg px-3.5 py-2.5 text-xs text-[#0037b0] hover:bg-slate-50 transition-colors font-bold cursor-pointer border-0 bg-transparent"
              >
                <HugeiconsIcon icon={PlusSignIcon} size={14} strokeWidth={1.5} />
                {query ? `New product "${query}"` : 'New product'}
              </button>
              <button
                type="button"
                onClick={() => {
                  onSelect({ kind: 'custom' })
                  setOpen(false)
                  setQuery('')
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3.5 py-2 text-xs text-slate-500 hover:bg-slate-50 transition-colors font-bold cursor-pointer border-0 bg-transparent"
              >
                Custom item
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const invoiceItemSchema = z.object({
  serviceItemId: z.string().optional(),
  inventoryItemId: z.string().optional(),
  description: z.string(),
  quantity: z.number().min(0.01, 'Quantity must be greater than 0'),
  unitPrice: z.number().min(0, 'Price must be 0 or greater'),
})

const installmentSchema = z.object({
  label: z.string().min(1, 'Label is required'),
  percentage: z.number().min(1).max(100),
})

const invoiceSchema = z.object({
  clientId: z.string().min(1, 'Client is required'),
  issueDate: z.string().min(1, 'Issue date is required'),
  dueDate: z.string().min(1, 'Due date is required'),
  items: z.array(invoiceItemSchema).min(1, 'At least one item is required'),
  discountType: z.enum(['PERCENTAGE', 'FIXED']).optional(),
  discountPercent: z.number().min(0).optional(),
  installments: z.array(installmentSchema).optional(),
  notes: z.string().optional(),
  terms: z.string().optional(),
})

type InvoiceFormData = z.infer<typeof invoiceSchema>

export function NewInvoicePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const preselectedClientId = searchParams.get('clientId') || ''
  
  // Wizard States
  const [mobileStep, setMobileStep] = useState(1)
  const [enableInstallments, setEnableInstallments] = useState(false)
  const [activeItemIndex, setActiveItemIndex] = useState<number | null>(null)
  const [isItemDrawerOpen, setIsItemDrawerOpen] = useState(false)

  // Modal States
  const [isCreateClientModalOpen, setIsCreateClientModalOpen] = useState(false)
  const [modalClientInitialName, setModalClientInitialName] = useState('')
  const [isCreateItemModalOpen, setIsCreateItemModalOpen] = useState(false)
  const [modalItemInitialKind, setModalItemInitialKind] = useState<'service' | 'inventory'>('service')
  const [modalItemInitialName, setModalItemInitialName] = useState('')
  const [creationItemIndex, setCreationItemIndex] = useState<number | null>(null)
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false)


  const { data: clientsData } = useQuery({
    queryKey: ['clients', { limit: 100 }],
    queryFn: () => clientsApi.list({ limit: 100 }),
  })

  const { data: serviceItems } = useQuery({
    queryKey: ['service-items'],
    queryFn: () => invoicesApi.listServiceItems(),
  })

  const { data: inventoryItems } = useQuery({
    queryKey: ['inventory-items'],
    queryFn: () => inventoryApi.list(),
  })

  const { data: organization } = useQuery({
    queryKey: ['organization'],
    queryFn: () => organizationsApi.getCurrent(),
  })

  const clientTriggerRef = useRef<HTMLButtonElement>(null)
  const itemsCardRef = useRef<HTMLDivElement>(null)

  const {
    register,
    control,
    handleSubmit,
    watch,
    getValues,
    setValue,
    setFocus,
    trigger,
    formState: { errors },
  } = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceSchema),
    shouldFocusError: false,
    defaultValues: {
      clientId: preselectedClientId,
      issueDate: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      items: [{ serviceItemId: undefined, inventoryItemId: undefined, description: '', quantity: 1, unitPrice: 0 }],
      discountType: 'PERCENTAGE',
      discountPercent: 0,
      installments: [],
      notes: '',
      terms: '',
    },
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  })

  const { fields: installmentFields, append: appendInstallment, remove: removeInstallment } = useFieldArray({
    control,
    name: 'installments',
  })

  // Automatically check and rename split items consistently (Payment 1, Payment 2, etc.) when added or removed
  const watchedInstallments = watch('installments') || []
  useEffect(() => {
    let changed = false
    const updated = watchedInstallments.map((inst, i) => {
      const expectedLabel = `Payment ${i + 1}`
      if (inst?.label !== expectedLabel) {
        changed = true
        return { ...inst, label: expectedLabel }
      }
      return inst
    })
    if (changed && watchedInstallments.length > 0) {
      setValue('installments', updated, { shouldValidate: true })
    }
  }, [watchedInstallments.length, setValue])

  useEffect(() => {
    if (organization?.paymentTerms && !getValues('terms')) {
      setValue('terms', organization.paymentTerms)
    }
    if (organization?.defaultNotes && !getValues('notes')) {
      setValue('notes', organization.defaultNotes)
    }
  }, [organization, setValue, getValues])

  const handleItemSelect = (
    index: number,
    selection: { kind: 'service'; id: string; item?: ServiceItem } | { kind: 'inventory'; id: string; item?: InventoryItem } | { kind: 'custom' },
  ) => {
    if (selection.kind === 'custom') {
      setValue(`items.${index}.serviceItemId`, undefined)
      setValue(`items.${index}.inventoryItemId`, undefined)
      return
    }
    if (selection.kind === 'service') {
      const serviceItem = selection.item ?? serviceItems?.find((item) => item.id === selection.id)
      if (serviceItem) {
        setValue(`items.${index}.serviceItemId`, serviceItem.id)
        setValue(`items.${index}.inventoryItemId`, undefined)
        setValue(`items.${index}.description`, serviceItem.name)
        setValue(`items.${index}.unitPrice`, serviceItem.unitPrice)
        if (!getValues(`items.${index}.quantity`)) setValue(`items.${index}.quantity`, 1)
      }
    } else {
      const invItem = selection.item ?? inventoryItems?.find((item) => item.id === selection.id)
      if (invItem) {
        setValue(`items.${index}.inventoryItemId`, invItem.id)
        setValue(`items.${index}.serviceItemId`, undefined)
        setValue(`items.${index}.description`, invItem.name)
        setValue(`items.${index}.unitPrice`, invItem.unitPrice)
        if (!getValues(`items.${index}.quantity`)) setValue(`items.${index}.quantity`, 1)
      }
    }
  }

  const watchInstallments = watch('installments') || []
  const installmentsTotal = watchInstallments.reduce((sum, inst) => sum + (inst?.percentage || 0), 0)

  const splitEqually = () => {
    const count = installmentFields.length
    if (count === 0) return
    const basePercent = Math.floor(100 / count)
    const remainder = 100 % count
    installmentFields.forEach((_, i) => {
      setValue(`installments.${i}.percentage`, basePercent + (i < remainder ? 1 : 0), { shouldValidate: true })
    })
  }

  const watchItems = watch('items') || []
  const watchDiscountType = watch('discountType') || 'PERCENTAGE'
  const watchDiscount = watch('discountPercent') || 0
  const subtotal = watchItems.reduce((sum, item) => {
    return sum + (item?.quantity || 0) * (item?.unitPrice || 0)
  }, 0)
  const discountAmount = watchDiscountType === 'FIXED'
    ? Math.min(watchDiscount, subtotal)
    : subtotal * (watchDiscount / 100)
  const afterDiscount = subtotal - discountAmount
  const vatEnabled = organization?.vatEnabled ?? false
  const orgTaxRate = organization?.taxRate ?? 0
  const vat = vatEnabled && orgTaxRate > 0 ? afterDiscount * (orgTaxRate / 100) : 0
  const total = afterDiscount + vat

  const createMutation = useMutation({
    mutationFn: (data: InvoiceFormData) => {
      if (enableInstallments && data.installments && data.installments.length > 0) {
        const total = data.installments.reduce((sum, inst) => sum + inst.percentage, 0)
        if (total !== 100) {
          throw new Error(`Installment percentages must add up to 100% (currently ${total}%)`)
        }
      }
      
      return invoicesApi.create({
        ...data,
        discountType: data.discountType || 'PERCENTAGE',
        discountPercent: Number(data.discountPercent) || 0,
        items: data.items.map(item => ({
          serviceItemId: item.serviceItemId,
          inventoryItemId: item.inventoryItemId,
          description: item.description,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
        })),
        installments: enableInstallments && data.installments && data.installments.length > 0
          ? data.installments.map(inst => ({
              label: inst.label,
              percentage: Number(inst.percentage),
            }))
          : undefined,
      })
    },
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] })
      posthog.capture('invoice_created', {
        invoice_id: invoice.id,
        invoice_number: invoice.invoiceNumber,
        has_installments: enableInstallments,
      })
      toast.success('Invoice created', { description: `Invoice ${invoice.invoiceNumber} has been created` })
      navigate(`/invoices/${invoice.id}`)
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (error: any) => {
      toast.error('Failed to create invoice', {
        description: error.response?.data?.message || 'Please try again',
      })
    },
  })

  function scrollAndFocus(el: HTMLElement | null) {
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.focus()
  }

  function focusField(name: Parameters<typeof setFocus>[0]) {
    setFocus(name)
    setTimeout(() => scrollAndFocus(document.activeElement as HTMLElement), 0)
  }

  const onFormError = (errs: FieldErrors<InvoiceFormData>) => {
    if (errs.clientId || errs.issueDate || errs.dueDate) {
      setMobileStep(1)
      if (errs.clientId) {
        scrollAndFocus(clientTriggerRef.current)
      } else if (errs.issueDate) {
        focusField('issueDate')
      } else {
        focusField('dueDate')
      }
      return
    }
    if (errs.items) {
      setMobileStep(2)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const itemsErr = errs.items as any
      if (itemsErr.message) {
        itemsCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
      }
      for (let i = 0; i < fields.length; i++) {
        if (itemsErr[i]) {
          setActiveItemIndex(i)
          setIsItemDrawerOpen(true)
          return
        }
      }
    }
    if (errs.installments || errs.notes || errs.terms) {
      setMobileStep(3)
    }
  }

  const onSubmit = (data: InvoiceFormData) => {
    createMutation.mutate(data)
  }

  const handleClientCreated = (clientId: string) => {
    setValue('clientId', clientId, { shouldValidate: true })
  }

  const handleItemCreated = (selection: { kind: 'service' | 'inventory'; id: string; item: ServiceItem | InventoryItem }) => {
    if (creationItemIndex !== null) {
      if (selection.kind === 'service') {
        handleItemSelect(creationItemIndex, { kind: 'service', id: selection.id, item: selection.item as ServiceItem })
      } else {
        handleItemSelect(creationItemIndex, { kind: 'inventory', id: selection.id, item: selection.item as InventoryItem })
      }
    }
  }

  return (
    <>
    <div className="flex flex-1 flex-col overflow-hidden bg-[#f8f9ff]">
      <Header
        title="New Invoice"
        description="Create a new invoice for your client"
      />

      {/* Mobile Wizard Segmented Progress Bar */}
      <div className="lg:hidden bg-white border-b border-slate-200/60 px-6 py-3 flex items-center justify-between shrink-0">
        <button
          type="button"
          onClick={() => setMobileStep(1)}
          className="flex flex-col items-center gap-1 flex-1 focus:outline-none"
        >
          <span className={cn(
            "w-7 h-7 flex items-center justify-center rounded-full text-xs font-semibold border transition-all duration-300",
            mobileStep >= 1
              ? "bg-[#0037b0] border-[#0037b0] text-white shadow-[0_0_8px_rgba(0,55,176,0.3)]"
              : "border-slate-200 text-slate-400 bg-slate-50"
          )}>
            1
          </span>
          <span className={cn(
            "text-[10px] font-semibold uppercase tracking-wider transition-colors",
            mobileStep === 1 ? "text-[#0037b0]" : "text-slate-400"
          )}>
            Details
          </span>
        </button>

        <div className={cn("h-[2px] w-6 flex-1 mx-2 transition-colors duration-300", mobileStep >= 2 ? "bg-[#0037b0]" : "bg-slate-100")} />

        <button
          type="button"
          onClick={async () => {
            const valid = await trigger(['clientId', 'issueDate', 'dueDate'])
            if (valid) setMobileStep(2)
            else toast.error('Please fill client details first')
          }}
          className="flex flex-col items-center gap-1 flex-1 focus:outline-none"
        >
          <span className={cn(
            "w-7 h-7 flex items-center justify-center rounded-full text-xs font-semibold border transition-all duration-300",
            mobileStep >= 2
              ? "bg-[#0037b0] border-[#0037b0] text-white shadow-[0_0_8px_rgba(0,55,176,0.3)]"
              : "border-slate-200 text-slate-400 bg-slate-50"
          )}>
            2
          </span>
          <span className={cn(
            "text-[10px] font-semibold uppercase tracking-wider transition-colors",
            mobileStep === 2 ? "text-[#0037b0]" : "text-slate-400"
          )}>
            Items
          </span>
        </button>

        <div className={cn("h-[2px] w-6 flex-1 mx-2 transition-colors duration-300", mobileStep >= 3 ? "bg-[#0037b0]" : "bg-slate-100")} />

        <button
          type="button"
          onClick={async () => {
            const valid = await trigger(['clientId', 'issueDate', 'dueDate', 'items'])
            if (valid) setMobileStep(3)
            else toast.error('Please complete details and items first')
          }}
          className="flex flex-col items-center gap-1 flex-1 focus:outline-none"
        >
          <span className={cn(
            "w-7 h-7 flex items-center justify-center rounded-full text-xs font-semibold border transition-all duration-300",
            mobileStep >= 3
              ? "bg-[#0037b0] border-[#0037b0] text-white shadow-[0_0_8px_rgba(0,55,176,0.3)]"
              : "border-slate-200 text-slate-400 bg-slate-50"
          )}>
            3
          </span>
          <span className={cn(
            "text-[10px] font-semibold uppercase tracking-wider transition-colors",
            mobileStep === 3 ? "text-[#0037b0]" : "text-slate-400"
          )}>
            Review
          </span>
        </button>
      </div>

      <div className="flex-1 overflow-auto px-4 pt-4 pb-44 sm:px-6 sm:pt-6 sm:pb-48">
        <form onSubmit={handleSubmit(onSubmit, onFormError)} className="mx-auto max-w-7xl">
          
          {/* TWO-COLUMN SIDEBAR LAYOUT FOR DESKTOP */}
          <div className="hidden lg:grid lg:grid-cols-3 lg:gap-6 items-start">
            
            {/* Left Column (Line Items, Totals, Notes & Terms) */}
            <div className="col-span-2 space-y-6">
              
              {/* Line Items Card */}
              <Card ref={itemsCardRef} className="shadow-[0px_12px_32px_rgba(0,55,176,0.06)] rounded-[24px]">
                <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-slate-100">
                  <CardTitle className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                    <HugeiconsIcon icon={Invoice03Icon} size={20} strokeWidth={1.5} className="text-[#0037b0]" />
                    Line Items
                  </CardTitle>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10 rounded-xl"
                    onClick={() => append({ serviceItemId: undefined, inventoryItemId: undefined, description: '', quantity: 1, unitPrice: 0 })}
                  >
                    <HugeiconsIcon icon={PlusSignIcon} size={16} strokeWidth={1.5} className="mr-2" />
                    Add Item
                  </Button>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="grid grid-cols-12 gap-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      <div className="col-span-5">Item / Description</div>
                      <div className="col-span-2">Quantity</div>
                      <div className="col-span-2">Unit Price</div>
                      <div className="col-span-2 text-right">Amount</div>
                      <div className="col-span-1"></div>
                    </div>

                    {/* Desktop Rows */}
                    {fields.map((field, index) => {
                      const quantity = watchItems[index]?.quantity || 0
                      const unitPrice = watchItems[index]?.unitPrice || 0
                      const amount = quantity * unitPrice
                      const invItemId = watchItems[index]?.inventoryItemId
                      const invItem = invItemId ? inventoryItems?.find((i) => i.id === invItemId) : null
                      const stockWarning = invItem && quantity > invItem.availableQuantity
                        ? `Only ${invItem.availableQuantity} units available`
                        : null

                      return (
                        <div key={field.id} className="grid grid-cols-12 gap-4 items-start py-2 border-b border-slate-50 last:border-0">
                          <div className="col-span-5 flex flex-col gap-2">
                            <ItemCombobox
                              serviceItems={serviceItems || []}
                              inventoryItems={inventoryItems || []}
                              onSelect={(sel) => handleItemSelect(index, sel)}
                              value={{
                                serviceItemId: watchItems[index]?.serviceItemId,
                                inventoryItemId: watchItems[index]?.inventoryItemId
                              }}
                              onCreateItemClick={(kind, name) => {
                                setModalItemInitialKind(kind)
                                setModalItemInitialName(name)
                                setCreationItemIndex(index)
                                setIsCreateItemModalOpen(true)
                              }}
                            />
                            <Input
                              placeholder="Description"
                              className="h-11 rounded-xl"
                              {...register(`items.${index}.description`)}
                              error={errors.items?.[index]?.description?.message}
                            />
                          </div>
                          
                          <div className="col-span-2 flex flex-col gap-2">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              className="h-11 rounded-xl [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              {...register(`items.${index}.quantity`, { valueAsNumber: true })}
                              error={errors.items?.[index]?.quantity?.message}
                            />
                            {stockWarning && (
                              <p className="mt-1 flex items-center gap-1.5 text-[11px] text-amber-600 font-semibold select-none leading-none">
                                <HugeiconsIcon icon={AlertCircleIcon} size={14} strokeWidth={1.5} className="shrink-0" />
                                {stockWarning}
                              </p>
                            )}
                          </div>

                          <div className="col-span-2 flex flex-col gap-2">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              className="h-11 rounded-xl [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              {...register(`items.${index}.unitPrice`, { valueAsNumber: true })}
                              error={errors.items?.[index]?.unitPrice?.message}
                            />
                          </div>

                          <div className="col-span-2 flex items-center justify-end h-11">
                            <span className="font-semibold text-slate-800 tabular-nums">{formatCurrency(amount)}</span>
                          </div>

                          <div className="col-span-1 flex justify-end items-start h-11 pt-0.5">
                            {fields.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => remove(index)}
                                className="h-10 w-10 rounded-xl hover:bg-rose-50 hover:text-rose-600 transition-colors"
                              >
                                <HugeiconsIcon icon={Delete02Icon} size={18} strokeWidth={1.5} className="text-slate-400 hover:text-rose-600" />
                              </Button>
                            )}
                          </div>
                        </div>
                      )
                    })}

                    {/* Desktop Totals Section Inline under items */}
                    <div className="border-t border-slate-100 pt-6">
                      <div className="flex justify-end">
                        <div className="w-full max-w-sm space-y-4">
                          <div className="flex justify-between items-center text-sm font-medium">
                            <span className="text-slate-500">Subtotal</span>
                            <span className="font-semibold text-slate-800">{formatCurrency(subtotal)}</span>
                          </div>
                          
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-sm font-medium text-slate-500">Discount</span>
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                step={watchDiscountType === 'PERCENTAGE' ? '1' : '0.01'}
                                min="0"
                                max={watchDiscountType === 'PERCENTAGE' ? '100' : undefined}
                                className="w-24 text-right h-10 rounded-xl"
                                {...register('discountPercent', { valueAsNumber: true })}
                              />
                              <div className="flex rounded-xl bg-slate-100 p-0.5 border border-slate-200/60 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => setValue('discountType', 'PERCENTAGE')}
                                  className={cn(
                                    "px-2.5 py-1 text-xs font-bold rounded-lg transition-all",
                                    watchDiscountType === 'PERCENTAGE'
                                      ? "bg-white text-[#0037b0] shadow-sm"
                                      : "text-slate-400 hover:text-[#0037b0]"
                                  )}
                                >
                                  %
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setValue('discountType', 'FIXED')}
                                  className={cn(
                                    "px-2.5 py-1 text-xs font-bold rounded-lg transition-all",
                                    watchDiscountType === 'FIXED'
                                      ? "bg-white text-[#0037b0] shadow-sm"
                                      : "text-slate-400 hover:text-[#0037b0]"
                                  )}
                                >
                                  ₦
                                </button>
                              </div>
                            </div>
                          </div>

                          {discountAmount > 0 && (
                            <div className="flex justify-between items-center text-sm font-medium text-emerald-600">
                              <span>Discount {watchDiscountType === 'PERCENTAGE' ? `(${watchDiscount}%)` : ''}</span>
                              <span>-{formatCurrency(discountAmount)}</span>
                            </div>
                          )}
                          
                          {vatEnabled && orgTaxRate > 0 && (
                            <div className="flex justify-between items-center text-sm font-medium text-slate-500">
                              <span>VAT ({orgTaxRate}%)</span>
                              <span className="font-semibold text-slate-800">{formatCurrency(vat)}</span>
                            </div>
                          )}
                          
                          <div className="flex justify-between border-t border-slate-100 pt-3 text-base font-bold text-slate-900">
                            <span>Total</span>
                            <span className="text-lg text-[#0037b0]">{formatCurrency(total)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>
                </CardContent>
              </Card>

              {/* Notes & Terms Card */}
              <Card className="shadow-[0px_12px_32px_rgba(0,55,176,0.06)] rounded-[24px]">
                <CardHeader className="pb-3">
                  <CardTitle className="text-md font-semibold text-slate-800 flex items-center gap-2">
                    <HugeiconsIcon icon={Note01Icon} size={18} strokeWidth={1.5} className="text-[#0037b0]" />
                    Additional Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="notes" className="text-slate-500 font-semibold flex items-center gap-1.5">
                        <HugeiconsIcon icon={Note01Icon} size={14} strokeWidth={1.5} />
                        Notes
                      </Label>
                      <Textarea
                        id="notes"
                        placeholder="Notes visible to the client..."
                        className="rounded-xl border-input min-h-[100px] focus:ring-1 focus:ring-[#0037b0]"
                        {...register('notes')}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="terms" className="text-slate-500 font-semibold flex items-center gap-1.5">
                        <HugeiconsIcon icon={LicenseIcon} size={14} strokeWidth={1.5} />
                        Terms & Conditions
                      </Label>
                      <Textarea
                        id="terms"
                        placeholder="Payment terms..."
                        className="rounded-xl border-input min-h-[100px] focus:ring-1 focus:ring-[#0037b0]"
                        {...register('terms')}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

            </div>

            {/* Right Column Sidebar (Invoice Details & Split Payments) */}
            <div className="space-y-6">
              
              {/* Invoice Details Sidebar Card */}
              <Card className="shadow-[0px_12px_32px_rgba(0,55,176,0.06)] rounded-[24px]">
                <CardHeader className="pb-3 border-b border-slate-100">
                  <CardTitle className="text-md font-semibold text-slate-800 flex items-center gap-2">
                    <HugeiconsIcon icon={UserIcon} size={18} strokeWidth={1.5} className="text-[#0037b0]" />
                    Invoice Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  <div className="space-y-1.5">
                    <Label required className="text-slate-500 font-semibold flex items-center gap-1.5">
                      <HugeiconsIcon icon={UserIcon} size={14} strokeWidth={1.5} />
                      Client
                    </Label>
                    <ClientCombobox
                      clients={clientsData?.data ?? []}
                      value={watch('clientId')}
                      onChange={(id) => setValue('clientId', id, { shouldValidate: true })}
                      error={errors.clientId?.message}
                      triggerRef={clientTriggerRef}
                      onCreateClientClick={(queryName) => {
                        setModalClientInitialName(queryName)
                        setIsCreateClientModalOpen(true)
                      }}
                    />
                  </div>
                  
                  <div className="space-y-1.5">
                    <Label htmlFor="issueDate" required className="text-slate-500 font-semibold">Issue Date</Label>
                    <DatePicker
                      value={watch('issueDate')}
                      onChange={(val) => setValue('issueDate', val, { shouldValidate: true })}
                      error={errors.issueDate?.message}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="dueDate" required className="text-slate-500 font-semibold">Due Date</Label>
                    <DatePicker
                      value={watch('dueDate')}
                      onChange={(val) => setValue('dueDate', val, { shouldValidate: true })}
                      error={errors.dueDate?.message}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Split Payments Sidebar Card */}
              <Card className="shadow-[0px_12px_32px_rgba(0,55,176,0.06)] rounded-[24px]">
                <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-slate-100">
                  <CardTitle className="text-md font-semibold text-slate-800 flex items-center gap-2">
                    <HugeiconsIcon icon={PercentCircleIcon} size={18} strokeWidth={1.5} className="text-[#0037b0]" />
                    Split Payments
                  </CardTitle>
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-650 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={enableInstallments}
                      onChange={(e) => {
                        setEnableInstallments(e.target.checked)
                        if (e.target.checked && installmentFields.length === 0) {
                          appendInstallment({ label: 'Payment 1', percentage: 75 })
                          appendInstallment({ label: 'Payment 2', percentage: 25 })
                        }
                      }}
                      className="h-4 w-4 rounded border-gray-300 text-[#0037b0] focus:ring-[#0037b0]"
                    />
                    Enable
                  </label>
                </CardHeader>
                
                {enableInstallments && (
                  <CardContent className="pt-4 space-y-4">
                    <p className="text-xs text-slate-450 leading-normal font-medium">
                      Percentages must sum to exactly 100%. Use Split Equally to balance them.
                    </p>
                    
                    <div className="space-y-3">
                      {installmentFields.map((field, index) => (
                        <div key={field.id} className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200/40">
                          <Input
                            placeholder="Label"
                            className="h-9 text-xs rounded-lg flex-1 bg-white"
                            {...register(`installments.${index}.label`)}
                          />
                          <div className="flex items-center gap-1 shrink-0 w-16">
                            <Input
                              type="number"
                              min="1"
                              max="100"
                              className="h-9 text-xs rounded-lg text-right bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              {...register(`installments.${index}.percentage`, { valueAsNumber: true })}
                            />
                            <span className="text-xs text-slate-400 font-bold">%</span>
                          </div>
                          <span className="text-[11px] font-semibold text-slate-500 w-20 text-right shrink-0 tabular-nums">
                            {formatCurrency(total * ((watchInstallments[index]?.percentage || 0) / 100))}
                          </span>
                          {installmentFields.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeInstallment(index)}
                              className="p-1 hover:text-rose-600 transition-colors"
                            >
                              <HugeiconsIcon icon={Delete02Icon} size={15} className="text-slate-400 hover:text-rose-600" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 text-xs flex-1 rounded-xl"
                        onClick={() => appendInstallment({ label: '', percentage: 0 })}
                      >
                        <HugeiconsIcon icon={PlusSignIcon} size={12} className="mr-1.5" />
                        Add
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 text-xs flex-1 rounded-xl"
                        onClick={splitEqually}
                      >
                        Split Equally
                      </Button>
                      <div className={cn(
                        "text-xs font-bold px-2 py-1 rounded-lg shrink-0 tabular-nums",
                        installmentsTotal === 100 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-500"
                      )}>
                        {installmentsTotal}%
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>

            </div>

          </div>

          {/* THREE-STEP MOBILE WIZARD FLOW */}
          <div className="lg:hidden space-y-4">
            
            {/* STEP 1: DETAILS */}
            {mobileStep === 1 && (
              <Card className="shadow-[0px_12px_32px_rgba(0,55,176,0.06)] rounded-[24px]">
                <CardHeader className="pb-3 border-b border-slate-100">
                  <CardTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
                    <HugeiconsIcon icon={UserIcon} size={18} strokeWidth={1.5} className="text-[#0037b0]" />
                    Invoice Details
                  </CardTitle>
                  <p className="text-xs text-slate-400">Client and dates details</p>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  <div className="space-y-1.5">
                    <Label required className="text-slate-500 font-semibold flex items-center gap-1.5">
                      <HugeiconsIcon icon={UserIcon} size={14} strokeWidth={1.5} />
                      Client
                    </Label>
                    <ClientCombobox
                      clients={clientsData?.data ?? []}
                      value={watch('clientId')}
                      onChange={(id) => setValue('clientId', id, { shouldValidate: true })}
                      error={errors.clientId?.message}
                      triggerRef={clientTriggerRef}
                      onCreateClientClick={(queryName) => {
                        setModalClientInitialName(queryName)
                        setIsCreateClientModalOpen(true)
                      }}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="issueDate" required className="text-slate-500 font-semibold">Issue Date</Label>
                    <DatePicker
                      value={watch('issueDate')}
                      onChange={(val) => setValue('issueDate', val, { shouldValidate: true })}
                      error={errors.issueDate?.message}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="dueDate" required className="text-slate-500 font-semibold">Due Date</Label>
                    <DatePicker
                      value={watch('dueDate')}
                      onChange={(val) => setValue('dueDate', val, { shouldValidate: true })}
                      error={errors.dueDate?.message}
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* STEP 2: LINE ITEMS */}
            {mobileStep === 2 && (
              <Card ref={itemsCardRef} className="shadow-[0px_12px_32px_rgba(0,55,176,0.06)] rounded-[24px]">
                <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <CardTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
                      <HugeiconsIcon icon={Invoice03Icon} size={18} strokeWidth={1.5} className="text-[#0037b0]" />
                      Line Items
                    </CardTitle>
                    <p className="text-xs text-slate-400">Add products or services</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 text-xs rounded-xl"
                    onClick={() => {
                      const newIdx = fields.length
                      append({ serviceItemId: undefined, inventoryItemId: undefined, description: '', quantity: 1, unitPrice: 0 })
                      setActiveItemIndex(newIdx)
                      setIsItemDrawerOpen(true)
                    }}
                  >
                    <HugeiconsIcon icon={PlusSignIcon} size={14} className="mr-1" />
                    Add Item
                  </Button>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  {fields.length === 0 ? (
                    <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-xl">
                      <p className="text-sm text-slate-400 font-medium">No items added yet</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {fields.map((field, index) => {
                        const quantity = watchItems[index]?.quantity || 0
                        const unitPrice = watchItems[index]?.unitPrice || 0
                        const amount = quantity * unitPrice
                        const desc = watchItems[index]?.description || 'No description'
                        const invItemId = watchItems[index]?.inventoryItemId
                        const invItem = invItemId ? inventoryItems?.find((i) => i.id === invItemId) : null
                        const stockWarning = invItem && quantity > invItem.availableQuantity

                        return (
                          <div
                            key={field.id}
                            onClick={() => {
                              setActiveItemIndex(index)
                              setIsItemDrawerOpen(true)
                            }}
                            className={cn(
                              "p-3 rounded-xl border border-slate-200/80 bg-white shadow-sm flex items-center justify-between cursor-pointer active:scale-98 transition-all",
                              stockWarning && "border-amber-400 bg-amber-50/10"
                            )}
                          >
                            <div className="space-y-1 pr-4">
                              <p className="text-sm font-semibold text-slate-800 truncate max-w-[200px]">{desc}</p>
                              <p className="text-xs text-slate-400 font-medium">
                                {quantity} × {formatCurrency(unitPrice)}
                              </p>
                              {stockWarning && (
                                <p className="text-[10px] text-amber-600 font-semibold flex items-center gap-1">
                                  <HugeiconsIcon icon={AlertCircleIcon} size={10} className="shrink-0" />
                                  Only {invItem?.availableQuantity} avail
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-sm font-bold text-slate-850 tabular-nums">{formatCurrency(amount)}</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  remove(index)
                                }}
                                className="p-2 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg"
                              >
                                <HugeiconsIcon icon={Delete02Icon} size={16} />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Mobile Totals Box */}
                  <div className="border-t border-slate-100 pt-4 space-y-3">
                    <div className="flex justify-between items-center text-xs font-semibold text-slate-500">
                      <span>Subtotal</span>
                      <span className="text-slate-800 font-bold">{formatCurrency(subtotal)}</span>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <span className="text-xs font-semibold text-slate-500">Discount</span>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          step={watchDiscountType === 'PERCENTAGE' ? '1' : '0.01'}
                          min="0"
                          max={watchDiscountType === 'PERCENTAGE' ? '100' : undefined}
                          className="w-20 text-right h-9 text-xs rounded-lg"
                          {...register('discountPercent', { valueAsNumber: true })}
                        />
                        <div className="flex rounded-lg bg-slate-100 p-0.5 border border-slate-200/60 shrink-0">
                          <button
                            type="button"
                            onClick={() => setValue('discountType', 'PERCENTAGE')}
                            className={cn(
                              "px-2 py-0.5 text-[10px] font-bold rounded transition-all",
                              watchDiscountType === 'PERCENTAGE'
                                ? "bg-white text-[#0037b0] shadow-sm"
                                : "text-slate-400"
                            )}
                          >
                            %
                          </button>
                          <button
                            type="button"
                            onClick={() => setValue('discountType', 'FIXED')}
                            className={cn(
                              "px-2 py-0.5 text-[10px] font-bold rounded transition-all",
                              watchDiscountType === 'FIXED'
                                ? "bg-white text-[#0037b0] shadow-sm"
                                : "text-slate-400"
                            )}
                          >
                            ₦
                          </button>
                        </div>
                      </div>
                    </div>

                    {discountAmount > 0 && (
                      <div className="flex justify-between items-center text-xs font-semibold text-emerald-600">
                        <span>Discount</span>
                        <span>-{formatCurrency(discountAmount)}</span>
                      </div>
                    )}
                    
                    {vatEnabled && orgTaxRate > 0 && (
                      <div className="flex justify-between items-center text-xs font-semibold text-slate-500">
                        <span>VAT ({orgTaxRate}%)</span>
                        <span className="text-slate-800 font-bold">{formatCurrency(vat)}</span>
                      </div>
                    )}

                    <div className="flex justify-between items-center border-t border-slate-100 pt-2 text-sm font-bold text-slate-800">
                      <span>Total Amount</span>
                      <span className="text-[#0037b0]">{formatCurrency(total)}</span>
                    </div>
                  </div>

                </CardContent>
              </Card>
            )}

            {/* STEP 3: REVIEW & TERMS */}
            {mobileStep === 3 && (
              <div className="space-y-4">
                      {/* Mobile Split Payments */}
                <Card className="shadow-[0px_12px_32px_rgba(0,55,176,0.06)] rounded-[24px]">
                  <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-slate-100">
                    <CardTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
                      <HugeiconsIcon icon={PercentCircleIcon} size={18} strokeWidth={1.5} className="text-[#0037b0]" />
                      Split Payments
                    </CardTitle>
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-655 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enableInstallments}
                        onChange={(e) => {
                          setEnableInstallments(e.target.checked)
                          if (e.target.checked && installmentFields.length === 0) {
                            appendInstallment({ label: 'Payment 1', percentage: 75 })
                            appendInstallment({ label: 'Payment 2', percentage: 25 })
                          }
                        }}
                        className="h-4 w-4 rounded border-gray-300 text-[#0037b0]"
                      />
                      Enable
                    </label>
                  </CardHeader>
                  
                  {enableInstallments && (
                    <CardContent className="pt-4 space-y-4">
                      <div className="space-y-3">
                        {installmentFields.map((field, index) => (
                          <div key={field.id} className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200/40">
                            <Input
                              placeholder="Label"
                              className="h-9 text-xs rounded-lg flex-1 bg-white"
                              {...register(`installments.${index}.label`)}
                            />
                            <div className="flex items-center gap-1 shrink-0 w-16">
                              <Input
                                type="number"
                                min="1"
                                max="100"
                                className="h-9 text-xs rounded-lg text-right bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                {...register(`installments.${index}.percentage`, { valueAsNumber: true })}
                              />
                              <span className="text-xs text-slate-400">%</span>
                            </div>
                            {installmentFields.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeInstallment(index)}
                                className="p-1 hover:text-rose-600 border-0 bg-transparent cursor-pointer"
                              >
                                <HugeiconsIcon icon={Delete02Icon} size={14} className="text-slate-450" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9 text-xs flex-1 rounded-xl"
                          onClick={() => appendInstallment({ label: '', percentage: 0 })}
                        >
                          Add
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9 text-xs flex-1 rounded-xl"
                          onClick={splitEqually}
                        >
                          Equal Split
                        </Button>
                        <div className={cn(
                          "text-xs font-bold px-2 py-1 rounded-lg shrink-0",
                          installmentsTotal === 100 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-500"
                        )}>
                          {installmentsTotal}%
                        </div>
                      </div>
                    </CardContent>
                  )}
                </Card>

                {/* Mobile Notes & Terms */}
                <Card className="shadow-[0px_12px_32px_rgba(0,55,176,0.06)] rounded-[24px]">
                  <CardHeader className="pb-3 border-b border-slate-100">
                    <CardTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
                      <HugeiconsIcon icon={Note01Icon} size={18} strokeWidth={1.5} className="text-[#0037b0]" />
                      Additional Info
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    <div className="space-y-1.5 text-left">
                      <Label htmlFor="notesMobile" className="text-slate-500 font-semibold flex items-center gap-1.5">
                        <HugeiconsIcon icon={Note01Icon} size={14} strokeWidth={1.5} />
                        Notes
                      </Label>
                      <Textarea
                        id="notesMobile"
                        placeholder="Notes visible to client..."
                        className="rounded-xl border-input min-h-[90px]"
                        {...register('notes')}
                      />
                    </div>
                    <div className="space-y-1.5 text-left">
                      <Label htmlFor="termsMobile" className="text-slate-500 font-semibold flex items-center gap-1.5">
                        <HugeiconsIcon icon={LicenseIcon} size={14} strokeWidth={1.5} />
                        Terms & Conditions
                      </Label>
                      <Textarea
                        id="termsMobile"
                        placeholder="Payment terms..."
                        className="rounded-xl border-input min-h-[90px]"
                        {...register('terms')}
                      />
                    </div>
                  </CardContent>
                </Card>

              </div>
            )}

          </div>

          {/* VIEWPORT-FIXED STICKY FOOTER (DESKTOP) */}
          <div className="hidden lg:flex fixed bottom-0 right-0 lg:left-64 left-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200/80 px-8 py-4 items-center justify-between shadow-[0_-4px_25px_rgba(0,55,176,0.06)] animate-in slide-in-from-bottom duration-300">
            <div className="flex gap-8 items-center">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Subtotal</span>
                <span className="text-sm font-bold text-slate-700 tabular-nums">{formatCurrency(subtotal)}</span>
              </div>
              {vatEnabled && orgTaxRate > 0 && (
                <div className="flex flex-col border-l border-slate-200/80 pl-8">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">VAT ({orgTaxRate}%)</span>
                  <span className="text-sm font-bold text-slate-700 tabular-nums">{formatCurrency(vat)}</span>
                </div>
              )}
              <div className="flex flex-col border-l border-slate-200/80 pl-8">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Amount</span>
                <span className="text-lg font-black text-[#0037b0] tabular-nums">{formatCurrency(total)}</span>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                className="h-11 px-5 rounded-xl font-bold border-slate-200 text-slate-650 hover:bg-slate-50 flex items-center gap-2"
                onClick={async () => {
                  const valid = await trigger()
                  if (valid) {
                    setIsPreviewModalOpen(true)
                  } else {
                    toast.error('Please fix validation errors before previewing')
                  }
                }}
              >
                <HugeiconsIcon icon={EyeIcon} size={16} strokeWidth={1.5} />
                Preview
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 px-6 rounded-xl font-bold border-slate-200 text-slate-650 hover:bg-slate-50"
                onClick={() => navigate(-1)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="h-11 px-8 rounded-xl font-bold bg-[#0037b0] hover:bg-[#0037b0]/90 border-0"
                isLoading={createMutation.isPending}
              >
                Create Invoice
              </Button>
            </div>
          </div>

          {/* VIEWPORT-FIXED STICKY FOOTER (MOBILE) */}
          <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200/80 px-6 py-4 flex items-center justify-between shadow-[0_-4px_20px_rgba(0,55,176,0.05)] pb-[calc(16px+env(safe-area-inset-bottom,0px))]">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Amount</span>
              <span className="text-base font-black text-[#0037b0] tabular-nums">{formatCurrency(total)}</span>
            </div>

            <div className="flex items-center gap-2">
              {mobileStep > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 px-4 rounded-xl text-xs font-bold border-slate-200 text-slate-650"
                  onClick={() => setMobileStep(mobileStep - 1)}
                >
                  Back
                </Button>
              )}
              
              {mobileStep === 1 && (
                <Button
                  type="button"
                  className="h-11 px-6 rounded-xl text-xs font-bold bg-[#0037b0] hover:bg-[#0037b0]/90 border-0"
                  onClick={async () => {
                    const valid = await trigger(['clientId', 'issueDate', 'dueDate'])
                    if (valid) setMobileStep(2)
                    else toast.error('Please enter details correctly')
                  }}
                >
                  Next: Items
                </Button>
              )}

              {mobileStep === 2 && (
                <Button
                  type="button"
                  className="h-11 px-6 rounded-xl text-xs font-bold bg-[#0037b0] hover:bg-[#0037b0]/90 border-0"
                  onClick={async () => {
                    const valid = await trigger(['items'])
                    if (valid) setMobileStep(3)
                    else toast.error('Please add items correctly')
                  }}
                >
                  Next: Review
                </Button>
              )}

              {mobileStep === 3 && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 px-4 rounded-xl text-xs font-bold border-slate-200 text-slate-650 flex items-center gap-1.5"
                    onClick={async () => {
                      const valid = await trigger()
                      if (valid) {
                        setIsPreviewModalOpen(true)
                      } else {
                        toast.error('Please fix validation errors first')
                      }
                    }}
                  >
                    <HugeiconsIcon icon={EyeIcon} size={14} strokeWidth={1.5} />
                    Preview
                  </Button>
                  <Button
                    type="submit"
                    className="h-11 px-6 rounded-xl text-xs font-bold bg-[#0037b0] hover:bg-[#0037b0]/90 border-0"
                    isLoading={createMutation.isPending}
                  >
                    Create
                  </Button>
                </>
              )}
            </div>
          </div>

        </form>
      </div>
    </div>

    {/* MOBILE BOTTOM SHEET / DRAWER FOR EDITING LINE ITEMS */}
    {isItemDrawerOpen && activeItemIndex !== null && (
      <div className="fixed inset-0 z-50 lg:hidden flex items-end justify-center">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
          onClick={() => setIsItemDrawerOpen(false)}
        />
        
        {/* Drawer Content */}
        <div className="relative w-full max-w-md bg-white rounded-t-[28px] border-t border-slate-200/50 p-6 shadow-[0px_-8px_30px_rgba(0,55,176,0.1)] z-10 max-h-[90vh] overflow-y-auto pb-[calc(24px+env(safe-area-inset-bottom,0px))] transition-transform transform duration-300">
          <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6" />
          
          <h3 className="text-lg font-bold text-slate-800 mb-4">
            {watchItems[activeItemIndex]?.description ? 'Edit Line Item' : 'Add Line Item'}
          </h3>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-slate-500 font-semibold">Select Predefined Item</Label>
              <ItemCombobox
                serviceItems={serviceItems || []}
                inventoryItems={inventoryItems || []}
                onSelect={(sel) => handleItemSelect(activeItemIndex, sel)}
                value={{
                  serviceItemId: watchItems[activeItemIndex]?.serviceItemId,
                  inventoryItemId: watchItems[activeItemIndex]?.inventoryItemId
                }}
                onCreateItemClick={(kind, name) => {
                  setModalItemInitialKind(kind)
                  setModalItemInitialName(name)
                  setCreationItemIndex(activeItemIndex)
                  setIsCreateItemModalOpen(true)
                }}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-slate-500 font-semibold">Description / Custom Name</Label>
              <Input
                placeholder="Item description"
                className="h-11 rounded-xl"
                {...register(`items.${activeItemIndex}.description`)}
                error={errors.items?.[activeItemIndex]?.description?.message}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-slate-500 font-semibold">Quantity</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  className="h-11 rounded-xl"
                  {...register(`items.${activeItemIndex}.quantity`, { valueAsNumber: true })}
                  error={errors.items?.[activeItemIndex]?.quantity?.message}
                />
                {(() => {
                  const qty = watchItems[activeItemIndex]?.quantity || 0
                  const invItemId = watchItems[activeItemIndex]?.inventoryItemId
                  const invItem = invItemId ? inventoryItems?.find((i) => i.id === invItemId) : null
                  const stockWarning = invItem && qty > invItem.availableQuantity
                    ? `Only ${invItem.availableQuantity} units available`
                    : null
                  return stockWarning ? (
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-amber-600 font-semibold leading-none">
                      <HugeiconsIcon icon={AlertCircleIcon} size={14} strokeWidth={1.5} className="shrink-0" />
                      {stockWarning}
                    </p>
                  ) : null
                })()}
              </div>

              <div className="space-y-1.5">
                <Label className="text-slate-500 font-semibold">Unit Price</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  className="h-11 rounded-xl"
                  {...register(`items.${activeItemIndex}.unitPrice`, { valueAsNumber: true })}
                  error={errors.items?.[activeItemIndex]?.unitPrice?.message}
                />
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-500">Amount:</span>
              <span className="text-lg font-black text-slate-800 tabular-nums">
                {formatCurrency((watchItems[activeItemIndex]?.quantity || 0) * (watchItems[activeItemIndex]?.unitPrice || 0))}
              </span>
            </div>

            <div className="flex gap-3 pt-2">
              {fields.length > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-xl text-rose-600 border-rose-200 hover:bg-rose-50"
                  onClick={() => {
                    remove(activeItemIndex)
                    setIsItemDrawerOpen(false)
                  }}
                >
                  Delete Item
                </Button>
              )}
              <Button
                type="button"
                className="h-11 rounded-xl bg-[#0037b0] hover:bg-[#0037b0]/90 flex-1 border-0"
                onClick={async () => {
                  const valid = await trigger([
                    `items.${activeItemIndex}.description`,
                    `items.${activeItemIndex}.quantity`,
                    `items.${activeItemIndex}.unitPrice`
                  ])
                  if (valid) {
                    setIsItemDrawerOpen(false)
                  } else {
                    toast.error('Please fix fields validation errors')
                  }
                }}
              >
                Done
              </Button>
            </div>

          </div>
        </div>
      </div>
    )}

    {isCreateClientModalOpen && (
      <CreateClientModal
        isOpen={isCreateClientModalOpen}
        onClose={() => setIsCreateClientModalOpen(false)}
        onSuccess={handleClientCreated}
        initialName={modalClientInitialName}
      />
    )}
    {isCreateItemModalOpen && (
      <CreateItemModal
        isOpen={isCreateItemModalOpen}
        onClose={() => setIsCreateItemModalOpen(false)}
        onSuccess={handleItemCreated}
        initialKind={modalItemInitialKind}
        initialName={modalItemInitialName}
      />
    )}
    {isPreviewModalOpen && (
      <InvoicePreviewModal
        isOpen={isPreviewModalOpen}
        onClose={() => setIsPreviewModalOpen(false)}
        formData={watch()}
        clients={clientsData?.data ?? []}
        organization={organization}
        onSubmit={handleSubmit(onSubmit)}
        isPending={createMutation.isPending}
      />
    )}
    </>
  )
}
