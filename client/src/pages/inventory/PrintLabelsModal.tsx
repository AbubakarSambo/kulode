import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Modal } from '@/components/shared/Modal'
import { Button, Input, Label } from '@/components/ui'
import { inventoryApi } from '@/api/inventory'
import { formatCurrency } from '@/lib/utils'
import { LABEL_CSS, MAX_LABELS_PER_PRINT, labelHtml, printLabels } from '@/lib/printLabels'
import type { InventoryItem } from '@/types'

const HEADER_KEY = 'labelHeader'

function readHeader(): string {
  try {
    return localStorage.getItem(HEADER_KEY) ?? ''
  } catch {
    return ''
  }
}

interface PrintLabelsModalProps {
  isOpen: boolean
  onClose: () => void
  items: InventoryItem[]
  /** Admins can give items without a barcode a code from here; everyone else just prints. */
  canAssignCodes: boolean
}

// Pick catalog items and how many stickers of each, then print 40×30mm barcode labels. Items with
// no barcode can't be labelled until they get a code — admins can assign the next in-store codes
// right here.
export function PrintLabelsModal({ isOpen, onClose, items, canAssignCodes }: PrintLabelsModalProps) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [copies, setCopies] = useState<Record<string, number>>({})
  // Remembered per device: it's the shop's short name, the same on every label it prints
  const [header, setHeader] = useState(readHeader)

  const visibleItems = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return items
    return items.filter((i) => i.name.toLowerCase().includes(term) || i.barcode?.toLowerCase().includes(term))
  }, [items, search])

  const withoutCode = items.filter((i) => !i.barcode)
  const entries = items
    .filter((i) => i.barcode && (copies[i.id] ?? 0) > 0)
    .map((i) => ({ item: { name: i.name, barcode: i.barcode!, sellPrice: i.sellPrice }, copies: copies[i.id] }))
  const totalLabels = entries.reduce((sum, e) => sum + e.copies, 0)

  const assignMutation = useMutation({
    mutationFn: () => inventoryApi.assignBarcodes(),
    onSuccess: (assigned) => {
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] })
      toast.success(`Assigned codes to ${assigned.length} item${assigned.length === 1 ? '' : 's'}`)
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      toast.error('Could not assign codes', { description: error.response?.data?.message || 'Please try again' })
    },
  })

  const setCopiesFor = (id: string, value: number) =>
    setCopies((prev) => ({ ...prev, [id]: Math.max(0, Math.floor(Number.isFinite(value) ? value : 0)) }))

  // A delivery gets one sticker per unit received — on-hand stock is the usual starting point
  const fillWithStock = () =>
    setCopies(Object.fromEntries(visibleItems.filter((i) => i.barcode).map((i) => [i.id, Math.max(0, Math.floor(i.onHandQuantity))])))

  const updateHeader = (value: string) => {
    setHeader(value)
    try {
      localStorage.setItem(HEADER_KEY, value)
    } catch {
      // Blocked storage — the header just won't be remembered next time
    }
  }

  const print = () => {
    if (totalLabels > MAX_LABELS_PER_PRINT) {
      toast.error(`That's ${totalLabels} labels — print at most ${MAX_LABELS_PER_PRINT} at a time`)
      return
    }
    printLabels(entries, { header })
  }

  const previewItem = entries[0]?.item ?? items.find((i) => i.barcode)

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Print Labels" description="40 × 30mm barcode stickers for your stock">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="label-header">Label header</Label>
            <Input id="label-header" value={header} onChange={(e) => updateHeader(e.target.value)} placeholder="e.g. DZYN (optional)" maxLength={24} />
          </div>
          {previewItem && (
            <div className="flex flex-col items-center gap-1">
              <style>{LABEL_CSS}</style>
              <div
                className="rounded border border-border shadow-sm"
                aria-label="Label preview"
                dangerouslySetInnerHTML={{
                  __html: labelHtml(
                    { name: previewItem.name, barcode: previewItem.barcode!, sellPrice: previewItem.sellPrice },
                    { header },
                  ),
                }}
              />
              <span className="text-[11px] text-muted-foreground">Preview</span>
            </div>
          )}
        </div>

        {withoutCode.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/50 p-3 text-sm">
            <span>
              {withoutCode.length} item{withoutCode.length === 1 ? ' has' : 's have'} no barcode and can't be labelled yet.
            </span>
            {canAssignCodes ? (
              <Button size="sm" variant="outline" isLoading={assignMutation.isPending} onClick={() => assignMutation.mutate()}>
                Assign codes
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">Ask an admin to assign codes.</span>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search items" className="flex-1" />
          <Button variant="ghost" size="sm" onClick={fillWithStock}>
            Fill with stock
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCopies({})}>
            Clear
          </Button>
        </div>

        <div className="max-h-72 divide-y divide-border overflow-y-auto rounded-xl border border-border">
          {visibleItems.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium text-foreground">{item.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {item.barcode ?? 'No barcode'}
                  {item.sellPrice != null && ` · ${formatCurrency(item.sellPrice)}`} · {item.onHandQuantity} in stock
                </div>
              </div>
              <Input
                type="number"
                min={0}
                aria-label={`Labels for ${item.name}`}
                className="w-20 shrink-0"
                disabled={!item.barcode}
                value={copies[item.id] ?? 0}
                onChange={(e) => setCopiesFor(item.id, e.target.valueAsNumber)}
              />
            </div>
          ))}
          {visibleItems.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">No items match</p>}
        </div>

        <p className="text-xs text-muted-foreground">
          In the print dialog, choose your label printer and leave margins and scaling off — each page is already one 40 × 30mm label.
        </p>

        <Button className="w-full" disabled={totalLabels === 0} onClick={print}>
          {totalLabels === 0 ? 'Print labels' : `Print ${totalLabels} label${totalLabels === 1 ? '' : 's'}`}
        </Button>
      </div>
    </Modal>
  )
}
