import { useState } from 'react'
import { Input, Label } from '@/components/ui'
import { cn, formatCurrency } from '@/lib/utils'

interface TipSectionProps {
  presets: number[]
  // The tip currently chosen, in Naira. 0 = no tip.
  value: number
  onChange: (amount: number) => void
  // Who the tip is for — shown so the guest knows it is not going to the cashier.
  waiterName: string | null
  billDue: number
  // Offered when the guest pays on the Moniepoint terminal or by transfer: those payments close the
  // order by webhook, so the tip is saved ahead of time and matched when the money lands.
  onSaveForTerminal?: () => void
  savingForTerminal?: boolean
}

function Chips({
  presets,
  value,
  custom,
  onPreset,
  onCustomToggle,
  onNone,
  large,
}: {
  presets: number[]
  value: number
  custom: boolean
  onPreset: (n: number) => void
  onCustomToggle: () => void
  onNone: () => void
  large?: boolean
}) {
  const chip = (active: boolean) =>
    cn(
      'shrink-0 cursor-pointer rounded-full font-medium',
      large ? 'px-6 py-4 text-lg' : 'px-4 py-2 text-sm',
      active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
    )
  return (
    <div className="flex flex-wrap gap-2">
      {presets.map((p) => (
        <button key={p} type="button" className={chip(!custom && value === p)} onClick={() => onPreset(p)}>
          {formatCurrency(p)}
        </button>
      ))}
      <button type="button" className={chip(custom)} onClick={onCustomToggle}>
        Custom
      </button>
      <button type="button" className={chip(!custom && value === 0)} onClick={onNone}>
        No tip
      </button>
    </div>
  )
}

/**
 * The "Add tip" part of the payment screen. Collapsed by default — most guests don't tip, so
 * checkout stays one tap shorter — and only ever rendered for card/transfer payments.
 * "Hand to guest" shows a stripped-down full-screen view with nothing but the tip choice, so the
 * guest can pick their own amount without seeing the rest of the till.
 */
export function TipSection({ presets, value, onChange, waiterName, billDue, onSaveForTerminal, savingForTerminal }: TipSectionProps) {
  const [open, setOpen] = useState(value > 0)
  const [custom, setCustom] = useState(false)
  const [customText, setCustomText] = useState('')
  const [guestView, setGuestView] = useState(false)
  // The guest screen edits a draft and only commits on Confirm.
  const [draft, setDraft] = useState(0)
  const [draftCustom, setDraftCustom] = useState(false)
  const [draftText, setDraftText] = useState('')

  const forLabel = waiterName ? `Tip for ${waiterName}` : 'Tip (no waiter on this order)'

  const pickCustom = (text: string) => {
    setCustomText(text)
    const n = Number(text)
    onChange(Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0)
  }

  if (!open) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-border p-3">
        <span className="text-sm text-muted-foreground">Guest wants to tip?</span>
        <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-primary hover:underline">
          Add tip
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-2 rounded-xl border border-border p-3">
        <div className="flex items-center justify-between">
          <Label>{forLabel}</Label>
          <button
            type="button"
            onClick={() => {
              setDraft(value)
              setDraftCustom(false)
              setDraftText('')
              setGuestView(true)
            }}
            className="text-xs font-medium text-primary hover:underline"
          >
            Hand to guest
          </button>
        </div>
        <Chips
          presets={presets}
          value={value}
          custom={custom}
          onPreset={(n) => {
            setCustom(false)
            onChange(n)
          }}
          onCustomToggle={() => {
            setCustom(true)
            pickCustom(customText)
          }}
          onNone={() => {
            setCustom(false)
            setCustomText('')
            onChange(0)
            setOpen(false)
          }}
        />
        {custom && (
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            placeholder="Tip amount"
            value={customText}
            onChange={(e) => pickCustom(e.target.value)}
          />
        )}
        {value > 0 && (
          <p className="text-xs text-muted-foreground">
            Kept separate from the bill, VAT and service charge — held for {waiterName ?? 'whoever the manager assigns'}.
          </p>
        )}
        {value > 0 && onSaveForTerminal && (
          <button
            type="button"
            disabled={savingForTerminal}
            onClick={onSaveForTerminal}
            className="w-full cursor-pointer rounded-lg border border-primary/30 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/5 disabled:opacity-50"
          >
            Guest pays on the terminal or by transfer — save tip, charge {formatCurrency(billDue + value)}
          </button>
        )}
      </div>

      {guestView && (
        <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-6 bg-background p-6 text-center">
          <div>
            <p className="text-sm text-muted-foreground">Your bill</p>
            <p className="text-3xl font-bold text-foreground">{formatCurrency(billDue)}</p>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-foreground">Would you like to add a tip?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {waiterName ? `It goes to ${waiterName}.` : 'It is shared out by the manager.'}
            </p>
          </div>
          <div className="max-w-md">
            <Chips
              large
              presets={presets}
              value={draft}
              custom={draftCustom}
              onPreset={(n) => {
                setDraftCustom(false)
                setDraft(n)
              }}
              onCustomToggle={() => {
                setDraftCustom(true)
                const n = Number(draftText)
                setDraft(Number.isFinite(n) && n > 0 ? n : 0)
              }}
              onNone={() => {
                setDraftCustom(false)
                setDraftText('')
                setDraft(0)
              }}
            />
          </div>
          {draftCustom && (
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              autoFocus
              className="max-w-xs text-center text-lg"
              placeholder="Enter amount"
              value={draftText}
              onChange={(e) => {
                setDraftText(e.target.value)
                const n = Number(e.target.value)
                setDraft(Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0)
              }}
            />
          )}
          <button
            type="button"
            onClick={() => {
              onChange(draft)
              setCustom(draftCustom)
              setCustomText(draftCustom ? draftText : '')
              if (draft === 0) setOpen(false)
              setGuestView(false)
            }}
            className="w-full max-w-xs cursor-pointer rounded-full bg-primary px-6 py-4 text-lg font-semibold text-primary-foreground"
          >
            {draft > 0 ? `Confirm ${formatCurrency(draft)} tip` : 'Continue without a tip'}
          </button>
        </div>
      )}
    </>
  )
}
