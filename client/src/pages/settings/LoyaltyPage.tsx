import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { Header } from '@/components/layout'
import { Button, Card, CardContent, Input, Label } from '@/components/ui'
import { loyaltyApi, menuCategoriesApi, menuItemsApi } from '@/api'
import type { LoyaltySettings, LoyaltyRuleInput, MemberDiscountInput } from '@/api'
import type { MenuCategory, MenuItem } from '@/types'

interface RuleDraft {
  key: string
  id?: string
  name: string
  thresholdAmount: string
  repeating: boolean
  maxPerOrder: string
  foodCost: string
  itemIds: string[]
  isActive: boolean
}

interface DiscountDraft {
  key: string
  id?: string
  name: string
  ratePct: string
  itemIds: string[]
  categoryIds: string[]
  isActive: boolean
}

const discountsFromServer = (s: LoyaltySettings): DiscountDraft[] =>
  s.discounts.map((d) => ({ key: d.id, id: d.id, name: d.name, ratePct: String(d.ratePct), itemIds: d.menuItemIds, categoryIds: d.categoryIds, isActive: d.isActive }))

const blankDiscount = (): DiscountDraft => ({ key: crypto.randomUUID(), name: '', ratePct: '', itemIds: [], categoryIds: [], isActive: true })

const discountToInput = (d: DiscountDraft): MemberDiscountInput => ({
  ...(d.id ? { id: d.id } : {}),
  name: d.name.trim(),
  ratePct: Number(d.ratePct),
  menuItemIds: d.itemIds,
  categoryIds: d.categoryIds,
  isActive: d.isActive,
})

const discountValid = (d: DiscountDraft) =>
  d.name.trim() !== '' && Number(d.ratePct) > 0 && Number(d.ratePct) <= 100 && (d.itemIds.length > 0 || d.categoryIds.length > 0)

const fromServer = (s: LoyaltySettings): RuleDraft[] =>
  s.rules.map((r) => ({
    key: r.id,
    id: r.id,
    name: r.name,
    thresholdAmount: String(r.thresholdAmount),
    repeating: r.repeating,
    maxPerOrder: r.maxPerOrder ? String(r.maxPerOrder) : '',
    foodCost: r.foodCost ? String(r.foodCost) : '',
    itemIds: r.items.map((i) => i.id),
    isActive: r.isActive,
  }))

const blankRule = (): RuleDraft => ({
  key: crypto.randomUUID(),
  name: '',
  thresholdAmount: '',
  repeating: true,
  maxPerOrder: '',
  foodCost: '',
  itemIds: [],
  isActive: true,
})

const toInput = (r: RuleDraft): LoyaltyRuleInput => ({
  ...(r.id ? { id: r.id } : {}),
  name: r.name.trim(),
  thresholdAmount: Number(r.thresholdAmount),
  repeating: r.repeating,
  maxPerOrder: r.maxPerOrder ? Math.round(Number(r.maxPerOrder)) : null,
  foodCost: Number(r.foodCost) || 0,
  menuItemIds: r.itemIds,
  isActive: r.isActive,
})

const ruleValid = (r: RuleDraft) => r.name.trim() !== '' && Number(r.thresholdAmount) > 0 && r.itemIds.length > 0

const apiMessage = (error: any, fallback: string) => error?.response?.data?.message || fallback // eslint-disable-line @typescript-eslint/no-explicit-any

function ItemPicker({ items, selected, onChange, label = 'Items the customer can choose from' }: { items: MenuItem[]; selected: string[]; onChange: (ids: string[]) => void; label?: string }) {
  const [search, setSearch] = useState('')
  const shown = useMemo(() => items.filter((i) => i.name.toLowerCase().includes(search.trim().toLowerCase())), [items, search])
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  return (
    <div>
      <Label>
        {label} ({selected.length} selected)
      </Label>
      <Input className="mt-1" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search the menu" aria-label="Search menu items" />
      <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
        {shown.length === 0 && <p className="text-xs text-muted-foreground">No menu items match</p>}
        {shown.map((item) => (
          <label key={item.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} />
            {item.name}
          </label>
        ))}
      </div>
    </div>
  )
}

function RuleEditor({ rule, items, onChange, onRemove }: { rule: RuleDraft; items: MenuItem[]; onChange: (patch: Partial<RuleDraft>) => void; onRemove?: () => void }) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Reward name</Label>
            <Input value={rule.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="e.g. Meal Reward" />
          </div>
          <div>
            <Label>Earned for every (₦ of lifetime spend)</Label>
            <Input type="number" min={1} value={rule.thresholdAmount} onChange={(e) => onChange({ thresholdAmount: e.target.value })} placeholder="100000" />
          </div>
          <div>
            <Label>Most per order (blank = no limit)</Label>
            <Input type="number" min={1} value={rule.maxPerOrder} onChange={(e) => onChange({ maxPerOrder: e.target.value })} placeholder="1" />
          </div>
          <div>
            <Label>Cost of the free item to you (₦)</Label>
            <Input type="number" min={0} value={rule.foodCost} onChange={(e) => onChange({ foodCost: e.target.value })} placeholder="2700" />
          </div>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={rule.repeating} onChange={(e) => onChange({ repeating: e.target.checked })} />
            Repeats (again at 2×, 3×…)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={rule.isActive} onChange={(e) => onChange({ isActive: e.target.checked })} />
            Active
          </label>
        </div>
        <ItemPicker items={items} selected={rule.itemIds} onChange={(itemIds) => onChange({ itemIds })} />
        {onRemove && (
          <Button type="button" size="sm" variant="outline" onClick={onRemove}>
            Remove
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function DiscountEditor({
  discount,
  items,
  categories,
  onChange,
  onRemove,
}: {
  discount: DiscountDraft
  items: MenuItem[]
  categories: MenuCategory[]
  onChange: (patch: Partial<DiscountDraft>) => void
  onRemove?: () => void
}) {
  const toggleCategory = (id: string) =>
    onChange({ categoryIds: discount.categoryIds.includes(id) ? discount.categoryIds.filter((c) => c !== id) : [...discount.categoryIds, id] })
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Discount name</Label>
            <Input value={discount.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="e.g. Event space" />
          </div>
          <div>
            <Label>Percentage off (%)</Label>
            <Input type="number" min={0.01} max={100} step="0.01" value={discount.ratePct} onChange={(e) => onChange({ ratePct: e.target.value })} placeholder="7.5" />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={discount.isActive} onChange={(e) => onChange({ isActive: e.target.checked })} />
          Active
        </label>
        {categories.length > 0 && (
          <div>
            <Label>Whole categories it applies to</Label>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
              {categories.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={discount.categoryIds.includes(c.id)} onChange={() => toggleCategory(c.id)} />
                  {c.name}
                </label>
              ))}
            </div>
          </div>
        )}
        <ItemPicker label="Individual items it applies to" items={items} selected={discount.itemIds} onChange={(itemIds) => onChange({ itemIds })} />
        {onRemove && (
          <Button type="button" size="sm" variant="outline" onClick={onRemove}>
            Remove
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function LoyaltyForm({ settings, items, categories }: { settings: LoyaltySettings; items: MenuItem[]; categories: MenuCategory[] }) {
  const queryClient = useQueryClient()
  const [enabled, setEnabled] = useState(settings.enabled)
  const [expiryDays, setExpiryDays] = useState(String(settings.expiryDays))
  const [rules, setRules] = useState<RuleDraft[]>(() => fromServer(settings))
  const [discounts, setDiscounts] = useState<DiscountDraft[]>(() => discountsFromServer(settings))

  const save = useMutation({
    mutationFn: () => loyaltyApi.updateSettings({ enabled, expiryDays: Math.round(Number(expiryDays)), rules: rules.map(toInput), discounts: discounts.map(discountToInput) }),
    onSuccess: (saved) => {
      queryClient.setQueryData(['loyalty-settings'], saved)
      setRules(fromServer(saved))
      setDiscounts(discountsFromServer(saved))
      toast.success('Loyalty settings saved')
    },
    onError: (error) => toast.error(apiMessage(error, 'Failed to save loyalty settings')),
  })

  const patch = (key: string, p: Partial<RuleDraft>) => setRules((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)))
  const activeRules = rules.filter((r) => r.isActive)
  const patchDiscount = (key: string, p: Partial<DiscountDraft>) => setDiscounts((ds) => ds.map((d) => (d.key === key ? { ...d, ...p } : d)))
  const valid = rules.every(ruleValid) && discounts.every(discountValid) && Number(expiryDays) >= 1 && (!enabled || activeRules.length > 0)

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-3 p-4">
          <label className="flex items-center gap-3 text-sm font-semibold">
            <input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            Loyalty programme is on
          </label>
          <p className="text-xs text-muted-foreground">
            {settings.startAt
              ? `Spend counts from ${new Date(settings.startAt).toLocaleDateString()}. Earlier orders are not back-credited.`
              : 'Spend counts from the day you first switch this on. Earlier orders are not back-credited.'}
          </p>
          <div className="max-w-xs">
            <Label>Rewards expire after (days)</Label>
            <Input type="number" min={1} max={3650} value={expiryDays} onChange={(e) => setExpiryDays(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div>
          <p className="text-sm font-semibold">Rewards</p>
          <p className="text-xs text-muted-foreground">
            A member earns one of each reward for every amount of lifetime spend shown. Add a second reward for a bigger milestone.
          </p>
        </div>
        {rules.map((rule) => (
          <RuleEditor
            key={rule.key}
            rule={rule}
            items={items}
            onChange={(p) => patch(rule.key, p)}
            onRemove={rule.id ? undefined : () => setRules((rs) => rs.filter((r) => r.key !== rule.key))}
          />
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setRules((rs) => [...rs, blankRule()])}>
          <Plus className="mr-1 h-4 w-4" /> Add a reward
        </Button>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-sm font-semibold">Member discounts</p>
          <p className="text-xs text-muted-foreground">
            A percentage off chosen items or categories, only for loyalty members. Staff apply it from the order screen with no PIN; stacking it on another discount needs a supervisor.
          </p>
        </div>
        {discounts.map((d) => (
          <DiscountEditor
            key={d.key}
            discount={d}
            items={items}
            categories={categories}
            onChange={(p) => patchDiscount(d.key, p)}
            onRemove={d.id ? undefined : () => setDiscounts((ds) => ds.filter((x) => x.key !== d.key))}
          />
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setDiscounts((ds) => [...ds, blankDiscount()])}>
          <Plus className="mr-1 h-4 w-4" /> Add a member discount
        </Button>
      </div>

      <Button disabled={!valid} isLoading={save.isPending} onClick={() => save.mutate()}>
        Save loyalty settings
      </Button>
    </div>
  )
}

/** Admin: switch the loyalty programme on and define what members earn. */
export function LoyaltyPage() {
  const settings = useQuery({ queryKey: ['loyalty-settings'], queryFn: loyaltyApi.settings })
  const items = useQuery({ queryKey: ['menu-items', 'all'], queryFn: () => menuItemsApi.list() })
  const categories = useQuery({ queryKey: ['menu-categories'], queryFn: () => menuCategoriesApi.list() })

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header title="Loyalty" description="Reward customers who keep coming back" />
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-3xl">
          {settings.isLoading || items.isLoading || categories.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !settings.data ? (
            <p className="text-sm text-red-600">Could not load loyalty settings</p>
          ) : !settings.data.available ? (
            <p className="text-sm text-muted-foreground">Loyalty is only available for restaurant organizations.</p>
          ) : (
            <LoyaltyForm settings={settings.data} items={items.data ?? []} categories={categories.data ?? []} />
          )}
        </div>
      </div>
    </div>
  )
}

export default LoyaltyPage
