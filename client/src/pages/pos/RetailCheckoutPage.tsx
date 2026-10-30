import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Trash2, Minus, Plus, ScanLine, X } from 'lucide-react'
import { Header } from '@/components/layout'
import { Button, Card, CardContent, Input, Label, SearchableSelect } from '@/components/ui'
import { customersApi, inventoryApi, ordersApi, organizationsApi, paymentTypesApi } from '@/api'
import { cn, formatCurrency, formatPaymentMethod } from '@/lib/utils'
import { printBill } from '@/lib/printBill'
import { computeOrderCharges } from '@/lib/orderCharges'
import type { Customer, InventoryItem } from '@/types'

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

// The built-in wallet tender (a reserved payment method, never a configured PaymentType) — charges
// the selected customer's wallet, so the sale must carry that customer.
const WALLET = 'WALLET'

function useIsOnline() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return isOnline
}

export function RetailCheckoutPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isOnline = useIsOnline()
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

  // For the org's VAT / entertainment tax / service charge — the API adds whichever are enabled to
  // every sale, so the total shown and charged here must include them. Always refetched on mount,
  // like OrderTakingPage, so a rate change in settings shows up at the next sale.
  const { data: organization } = useQuery({
    queryKey: ['organization'],
    queryFn: () => organizationsApi.getCurrent(),
    staleTime: 0,
    refetchOnMount: 'always',
  })

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

  // Wallet sale: who's paying. Searched server-side (debounced) like OrderDetailPage's customer
  // picker, so an org with thousands of customers can still find older ones.
  const [walletCustomer, setWalletCustomer] = useState<Customer | null>(null)
  const [customerSearch, setCustomerSearch] = useState('')
  const [debouncedCustomerSearch, setDebouncedCustomerSearch] = useState('')
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedCustomerSearch(customerSearch), 300)
    return () => clearTimeout(handler)
  }, [customerSearch])
  const isWallet = paymentMethod === WALLET
  const { data: customersPage } = useQuery({
    queryKey: ['customers', { limit: 100, search: debouncedCustomerSearch || undefined }],
    queryFn: () => customersApi.list({ limit: 100, search: debouncedCustomerSearch || undefined }),
    enabled: isWallet,
  })
  const customerOptions = useMemo(
    () => (customersPage?.data ?? []).map((c) => ({ id: c.id, label: c.phone ? `${c.name} (${c.phone})` : c.name })),
    [customersPage],
  )

  // A wallet charge has to be checked against the balance at the moment of sale — queued offline,
  // two sales could spend the same money — so the option is unavailable without a connection.
  useEffect(() => {
    if (!isOnline && isWallet) setPaymentMethod(paymentOptions[0]?.name ?? '')
  }, [isOnline, isWallet, paymentOptions])

  // Keeps the scan field focused at all times during checkout — a scanner is a keyboard-emulating
  // HID device, so it only "works" if this input (or nothing else) has focus when it fires.
  const refocusScanInput = () => {
    requestAnimationFrame(() => scanInputRef.current?.focus())
  }
  // ...except while the cashier is picking a wallet customer — the picker's search box needs focus
  // to be typed into. Resumes as soon as a customer is chosen (see pickWalletCustomer).
  const isPickingCustomer = isWallet && !walletCustomer
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
  const { vatAmount, entertainmentTaxAmount, serviceChargeAmount, total } = computeOrderCharges(subtotal, organization)

  const pickWalletCustomer = (customerId: string) => {
    setWalletCustomer(customersPage?.data.find((c) => c.id === customerId) ?? null)
    refocusScanInput()
  }

  // Shown to the cashier before charging; the server makes the real check (and will refuse a sale
  // past the credit limit).
  const balanceAfter = walletCustomer ? walletCustomer.walletBalance - total : undefined
  const exceedsCredit = walletCustomer !== null && balanceAfter !== undefined && balanceAfter < -walletCustomer.creditLimit

  const charge = async () => {
    if (cart.length === 0) return
    if (!paymentMethod) {
      toast.error('Select a payment method first')
      return
    }
    if (isWallet && !walletCustomer) {
      toast.error('Pick the customer whose wallet to charge')
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
        ...(isWallet && walletCustomer && { customerId: walletCustomer.id }),
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
      if (isWallet) {
        // Back to the default tender so the next sale isn't charged to this wallet by accident
        setWalletCustomer(null)
        setPaymentMethod(paymentOptions[0]?.name ?? '')
        queryClient.invalidateQueries({ queryKey: ['customers'] })
      }
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
              onBlur={() => {
                if (!isPickingCustomer) refocusScanInput()
              }}
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
        {total !== subtotal && (
          <div className="space-y-1 text-sm text-muted-foreground">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            {vatAmount > 0 && (
              <div className="flex justify-between">
                <span>VAT ({Number(organization?.taxRate)}%)</span>
                <span>{formatCurrency(vatAmount)}</span>
              </div>
            )}
            {entertainmentTaxAmount > 0 && (
              <div className="flex justify-between">
                <span>Entertainment Tax ({Number(organization?.entertainmentTaxRate)}%)</span>
                <span>{formatCurrency(entertainmentTaxAmount)}</span>
              </div>
            )}
            {serviceChargeAmount > 0 && (
              <div className="flex justify-between">
                <span>Service Charge ({Number(organization?.serviceChargeRate)}%)</span>
                <span>{formatCurrency(serviceChargeAmount)}</span>
              </div>
            )}
          </div>
        )}
        <div className="flex items-center justify-between text-lg font-semibold text-foreground">
          <span>Total</span>
          <span>{formatCurrency(total)}</span>
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
          <button
            type="button"
            disabled={!isOnline}
            title={isOnline ? undefined : 'Customer Wallet needs a connection'}
            onClick={() => setPaymentMethod(WALLET)}
            className={cn(
              'rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              isWallet ? 'bg-primary text-white' : 'bg-surface-container text-foreground hover:bg-surface-container-low',
            )}
          >
            Customer Wallet
          </button>
        </div>

        {!isOnline && (
          <p className="text-xs text-muted-foreground">Customer Wallet is unavailable offline — the balance has to be checked at the time of sale.</p>
        )}

        {isWallet && (
          <div className="space-y-2 rounded-xl border border-border p-3 text-sm">
            {walletCustomer ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-foreground">
                    {walletCustomer.name}
                    {walletCustomer.phone && <span className="font-normal text-muted-foreground"> · {walletCustomer.phone}</span>}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => setWalletCustomer(null)}>
                    <X className="mr-1 h-3.5 w-3.5" />
                    Change
                  </Button>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Current balance</span>
                  <span className={cn('font-semibold', walletCustomer.walletBalance < 0 ? 'text-destructive' : 'text-foreground')}>
                    {formatCurrency(walletCustomer.walletBalance)}
                  </span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Balance after sale</span>
                  <span className={cn('font-semibold', balanceAfter !== undefined && balanceAfter < 0 ? 'text-destructive' : 'text-foreground')}>
                    {balanceAfter !== undefined ? formatCurrency(balanceAfter) : '—'}
                  </span>
                </div>
                {balanceAfter !== undefined && balanceAfter < 0 && (
                  <p className={cn('text-xs', exceedsCredit ? 'text-destructive' : 'text-muted-foreground')}>
                    {exceedsCredit
                      ? `This exceeds the customer's approved credit limit of ${formatCurrency(walletCustomer.creditLimit)}.`
                      : 'This will put the customer on account (approved credit).'}
                  </p>
                )}
              </>
            ) : (
              <>
                <Label>Customer</Label>
                <SearchableSelect
                  options={customerOptions}
                  value=""
                  onChange={pickWalletCustomer}
                  onSearchChange={setCustomerSearch}
                  placeholder="Search by name or phone"
                />
              </>
            )}
          </div>
        )}

        <Button
          className="w-full"
          size="lg"
          disabled={cart.length === 0 || isCharging || (isWallet && (!walletCustomer || exceedsCredit))}
          isLoading={isCharging}
          onClick={charge}
        >
          Charge {formatCurrency(total)}
        </Button>
      </div>
    </div>
  )
}
