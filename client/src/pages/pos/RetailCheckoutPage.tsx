import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Trash2, Minus, Plus, ScanLine } from 'lucide-react'
import { Header } from '@/components/layout'
import { Button, Card, CardContent, Input, Label } from '@/components/ui'
import { inventoryApi, ordersApi, paymentTypesApi } from '@/api'
import { cn, formatCurrency, formatPaymentMethod } from '@/lib/utils'
import { printBill } from '@/lib/printBill'
import type { InventoryItem } from '@/types'

interface CartLine {
  inventoryItemId: string
  name: string
  quantity: number
  unitPrice: number
}

// A scan behaves as a burst of keystrokes arriving well under human typing speed, terminated by
// the scanner's own Enter — this just guards against a stray Enter on a near-empty buffer (e.g.
// someone tapping the field) rather than trying to hard-distinguish scan from manual entry, since
// this field has no other purpose that manual fast typing could be confused with.
const MIN_CODE_LENGTH = 3

// Name search kicks in from two characters so a single stray keystroke doesn't flood the list.
const MIN_SEARCH_LENGTH = 2
const MAX_SUGGESTIONS = 8

export function RetailCheckoutPage() {
  const navigate = useNavigate()
  const scanInputRef = useRef<HTMLInputElement>(null)
  const [scanValue, setScanValue] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [paymentMethod, setPaymentMethod] = useState<string>('')
  const [isCharging, setIsCharging] = useState(false)
  // Highlighted suggestion (arrow keys) — -1 means none, so a scanner's trailing Enter always goes
  // to the barcode lookup rather than silently adding whatever name suggestion happens to be first.
  const [activeIndex, setActiveIndex] = useState(-1)

  // Same cache key as the Catalog page, so items added there show up here without a refetch dance.
  const { data: catalog } = useQuery({
    queryKey: ['inventory-items'],
    queryFn: () => inventoryApi.list(),
  })

  const searchTerm = scanValue.trim().toLowerCase()
  const suggestions = useMemo(() => {
    if (searchTerm.length < MIN_SEARCH_LENGTH || !catalog) return []
    return catalog
      .filter(
        (item) =>
          item.name.toLowerCase().includes(searchTerm) ||
          item.sku?.toLowerCase().includes(searchTerm) ||
          item.barcode?.toLowerCase().includes(searchTerm),
      )
      .slice(0, MAX_SUGGESTIONS)
  }, [catalog, searchTerm])

  const { data: paymentTypes } = useQuery({
    queryKey: ['payment-types'],
    queryFn: () => paymentTypesApi.list(),
  })
  const paymentOptions = useMemo(
    () => (paymentTypes ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder),
    [paymentTypes],
  )

  useEffect(() => {
    if (!paymentMethod && paymentOptions.length > 0) setPaymentMethod(paymentOptions[0].name)
  }, [paymentOptions, paymentMethod])

  // Keeps the scan field focused at all times during checkout — a scanner is a keyboard-emulating
  // HID device, so it only "works" if this input (or nothing else) has focus when it fires.
  const refocusScanInput = () => {
    requestAnimationFrame(() => scanInputRef.current?.focus())
  }
  useEffect(() => {
    refocusScanInput()
  }, [])

  const addToCart = (item: { id: string; name: string; sellPrice?: number | null }) => {
    if (item.sellPrice == null) {
      toast.error(`"${item.name}" has no sell price set — add one in Catalog before selling it`)
      return
    }
    setCart((prev) => {
      const existing = prev.find((line) => line.inventoryItemId === item.id)
      if (existing) {
        return prev.map((line) =>
          line.inventoryItemId === item.id ? { ...line, quantity: line.quantity + 1 } : line,
        )
      }
      return [...prev, { inventoryItemId: item.id, name: item.name, quantity: 1, unitPrice: item.sellPrice! }]
    })
  }

  const lookupMutation = useMutation({
    mutationFn: ({ code }: { code: string; nameMatches: InventoryItem[] }) => inventoryApi.lookupByBarcode(code),
    onSuccess: (item) => addToCart(item),
    // Not a barcode — if what was typed names exactly one catalog item, Enter just adds that.
    onError: (_err, { code, nameMatches }) => {
      if (nameMatches.length === 1) addToCart(nameMatches[0])
      else if (nameMatches.length > 1) {
        // Put the text back so the suggestion list reappears for the cashier to pick from.
        setScanValue(code)
        toast.error(`Several items match "${code}" — pick one from the list`)
      } else toast.error(`No item found for "${code}"`)
    },
  })

  const resetSearch = () => {
    setScanValue('')
    setActiveIndex(-1)
  }

  const pickSuggestion = (item: InventoryItem) => {
    addToCart(item)
    resetSearch()
    refocusScanInput()
  }

  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (activeIndex >= 0 && suggestions[activeIndex]) {
      pickSuggestion(suggestions[activeIndex])
      return
    }
    const code = scanValue.trim()
    const nameMatches = suggestions
    resetSearch()
    if (code.length < MIN_CODE_LENGTH) return
    lookupMutation.mutate({ code, nameMatches })
  }

  const handleScanKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && suggestions.length > 0) {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp' && suggestions.length > 0) {
      e.preventDefault()
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
    } else if (e.key === 'Escape') {
      resetSearch()
    }
  }

  const updateQuantity = (inventoryItemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((line) =>
          line.inventoryItemId === inventoryItemId ? { ...line, quantity: line.quantity + delta } : line,
        )
        .filter((line) => line.quantity > 0),
    )
  }

  const removeLine = (inventoryItemId: string) => {
    setCart((prev) => prev.filter((line) => line.inventoryItemId !== inventoryItemId))
  }

  const subtotal = cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0)

  const charge = async () => {
    if (cart.length === 0) return
    if (!paymentMethod) {
      toast.error('Select a payment method first')
      return
    }
    setIsCharging(true)
    try {
      // "Retail Sale" is the dedicated order type OrderTypesService seeds for RETAIL-posMode orgs
      // (doesn't require a table) — kept distinct from the restaurant defaults like "Takeaway" so
      // platform-wide reports that group orders by source never conflate a supermarket checkout
      // sale with a restaurant's actual takeaway order.
      const order = await ordersApi.create({
        source: 'Retail Sale',
        items: cart.map((line) => ({ inventoryItemId: line.inventoryItemId, quantity: line.quantity })),
      })
      if ('__offlinePending' in order) {
        toast.success('No connection — sale queued and will sync automatically')
        setCart([])
        refocusScanInput()
        return
      }

      const closed = await ordersApi.close(order.id, { paymentMethod })
      if ('__offlinePending' in closed) {
        toast.success('No connection — payment queued and will sync automatically')
      } else {
        toast.success('Sale complete')
        try {
          printBill(await ordersApi.getReceiptData(order.id))
        } catch {
          // Printing is best-effort — the sale itself already succeeded above.
          toast.error('Sale completed, but the receipt could not be printed')
        }
      }
      setCart([])
      refocusScanInput()
    } catch (err) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(message || 'Failed to complete sale')
    } finally {
      setIsCharging(false)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header
        title="Checkout"
        description="Scan a barcode or search by item name to add it to the sale"
        action={
          <Button variant="ghost" size="sm" onClick={() => navigate('/inventory')}>
            View Catalog
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        <form onSubmit={handleScanSubmit}>
          <Label htmlFor="barcode-scan">Scan barcode or search</Label>
          <div className="relative mt-1">
            <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="barcode-scan"
              ref={scanInputRef}
              value={scanValue}
              onChange={(e) => {
                setScanValue(e.target.value)
                setActiveIndex(-1)
              }}
              onKeyDown={handleScanKeyDown}
              onBlur={refocusScanInput}
              autoComplete="off"
              className="pl-9"
              placeholder="Scan a barcode, or type an item name"
              role="combobox"
              aria-expanded={suggestions.length > 0}
              aria-controls="barcode-scan-suggestions"
              aria-activedescendant={activeIndex >= 0 ? `barcode-scan-option-${activeIndex}` : undefined}
            />
            {suggestions.length > 0 && (
              <ul
                id="barcode-scan-suggestions"
                role="listbox"
                className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-md border border-border bg-surface-container-lowest shadow-lg"
              >
                {suggestions.map((item, index) => (
                  <li
                    key={item.id}
                    id={`barcode-scan-option-${index}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    // mousedown, not click — otherwise the input's blur-refocus fires first and the
                    // list can re-render out from under the tap.
                    onMouseDown={(e) => {
                      e.preventDefault()
                      pickSuggestion(item)
                    }}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={cn(
                      'flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm',
                      index === activeIndex ? 'bg-surface-container' : 'hover:bg-surface-container-low',
                    )}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">{item.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {[item.sku, item.barcode].filter(Boolean).join(' · ') || 'No barcode'} · {item.availableQuantity} in
                        stock
                      </div>
                    </div>
                    <span className="shrink-0 font-semibold text-foreground">
                      {item.sellPrice != null ? formatCurrency(item.sellPrice) : 'No price'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </form>

        <div className="space-y-2">
          {cart.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">Cart is empty — scan or search for an item to begin</p>
          )}
          {cart.map((line) => (
            <Card key={line.inventoryItemId} className="p-3">
              <CardContent className="flex items-center justify-between gap-3 p-0">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-foreground">{line.name}</div>
                  <div className="text-sm text-muted-foreground">{formatCurrency(line.unitPrice)} each</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={() => updateQuantity(line.inventoryItemId, -1)}>
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="w-6 text-center font-medium">{line.quantity}</span>
                  <Button variant="ghost" size="icon" onClick={() => updateQuantity(line.inventoryItemId, 1)}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="w-24 text-right font-semibold text-foreground">
                  {formatCurrency(line.unitPrice * line.quantity)}
                </div>
                <Button variant="ghost" size="icon" onClick={() => removeLine(line.inventoryItemId)}>
                  <Trash2 className="h-4 w-4 text-error" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="border-t border-outline-variant/20 bg-surface-container-lowest p-4 sm:p-6 space-y-3">
        <div className="flex items-center justify-between text-lg font-semibold text-foreground">
          <span>Total</span>
          <span>{formatCurrency(subtotal)}</span>
        </div>

        <div className="flex flex-wrap gap-2">
          {paymentOptions.map((type) => (
            <button
              key={type.id}
              type="button"
              onClick={() => setPaymentMethod(type.name)}
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                paymentMethod === type.name
                  ? 'bg-primary text-white'
                  : 'bg-surface-container text-foreground hover:bg-surface-container-low'
              }`}
            >
              {formatPaymentMethod(type.name)}
            </button>
          ))}
        </div>

        <Button className="w-full" size="lg" disabled={cart.length === 0 || isCharging} isLoading={isCharging} onClick={charge}>
          Charge {formatCurrency(subtotal)}
        </Button>
      </div>
    </div>
  )
}
