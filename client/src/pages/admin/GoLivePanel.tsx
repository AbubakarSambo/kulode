import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button, Label } from '@/components/ui'
import { platformApi } from '@/api/platform'
import type { GoLiveCounts, PlatformOrganizationDetails } from '@/types'

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

/** Labels for the rows a go-live deletes, in display order. Zero rows are hidden. */
const DELETED_ROWS: Array<[keyof GoLiveCounts, string]> = [
  ['orders', 'Orders'],
  ['payments', 'Payments'],
  ['shifts', 'Shifts'],
  ['invoices', 'Invoices'],
  ['expenses', 'Expenses'],
  ['walletTransactions', 'Wallet transactions'],
  ['unreconciledTransfers', 'Unmatched transfers'],
  ['whatsappMessages', 'WhatsApp messages'],
  ['stockMovements', 'Sale stock movements'],
]

/**
 * "Go live" for a new tenant: wipes the orders, payments, shifts etc. they made while being set up
 * and demoed, keeping their menu, stock items, tables, staff and settings. One-shot per org — once
 * it has run, this shows what was cleared instead of the button.
 */
export function GoLivePanel({ org }: { org: PlatformOrganizationDetails }) {
  const [open, setOpen] = useState(false)

  if (org.wentLiveAt) {
    const c = org.goLiveSummary?.counts
    return (
      <div className="rounded-2xl bg-[#f8f9ff] p-4 space-y-1">
        <p className="text-[11px] font-bold text-[#434655] uppercase tracking-wider">Go live</p>
        <p className="text-xs text-[#121c28]">
          Went live on <span className="font-semibold">{fmtDate(org.wentLiveAt)}</span>
          {org.goLiveSummary && <> by {org.goLiveSummary.ranBy.email}</>}.
        </p>
        {c && (
          <p className="text-[10px] text-[#434655]">
            Cleared {c.orders} orders, {c.payments} payments, {c.shifts} shifts
            {c.invoices > 0 && `, ${c.invoices} invoices`}
            {c.expenses > 0 && `, ${c.expenses} expenses`}
            {org.goLiveSummary?.deleteCustomers && `, ${c.customers} customers`}.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-red-100 bg-red-50/40 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-[11px] font-bold text-red-700 uppercase tracking-wider">Go live</p>
          <p className="text-[10px] text-[#434655]">
            Deletes the orders, payments, shifts and other activity from setup and demos so they start clean.
            Menu, stock items, tables, staff and settings stay. Can only be done once.
          </p>
        </div>
        {!open && (
          <Button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 px-4 py-2 rounded-xl bg-white border border-red-200 text-red-700 text-xs font-bold hover:bg-red-50 min-h-[40px]"
          >
            Go live…
          </Button>
        )}
      </div>
      {open && <GoLiveConfirm org={org} onCancel={() => setOpen(false)} />}
    </div>
  )
}

function GoLiveConfirm({ org, onCancel }: { org: PlatformOrganizationDetails; onCancel: () => void }) {
  const queryClient = useQueryClient()
  const [confirmName, setConfirmName] = useState('')
  const [deleteCustomers, setDeleteCustomers] = useState(false)

  const { data: preview, isLoading } = useQuery({
    queryKey: ['platform', 'organization', org.id, 'go-live-preview'],
    queryFn: () => platformApi.previewGoLive(org.id),
    staleTime: 0,
  })

  const goLiveMutation = useMutation({
    mutationFn: () => platformApi.goLive(org.id, { confirmName, deleteCustomers }),
    onSuccess: (res) => {
      toast.success(`${org.name} is live — cleared ${res.counts.orders} test orders`)
      queryClient.invalidateQueries({ queryKey: ['platform'] })
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Go live failed — nothing was deleted')
    },
  })

  if (isLoading || !preview) {
    return <p className="text-[11px] text-slate-500">Counting test activity…</p>
  }

  const { counts } = preview
  const rows = DELETED_ROWS.filter(([key]) => counts[key] > 0)
  const nameMatches = confirmName.trim().toLowerCase() === org.name.trim().toLowerCase()

  return (
    <div className="space-y-3 border-t border-red-100 pt-3">
      {rows.length === 0 ? (
        <p className="text-xs text-[#121c28]">No test activity to clear. Going live just marks the org as live.</p>
      ) : (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-[#121c28]">
            This will permanently delete
            {preview.firstActivityAt && preview.lastActivityAt && (
              <span className="font-normal text-[#434655]">
                {' '}(activity from {fmtDate(preview.firstActivityAt)} to {fmtDate(preview.lastActivityAt)})
              </span>
            )}
            :
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {rows.map(([key, label]) => (
              <div key={key} className="bg-white rounded-xl px-3 py-2">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
                <p className="text-sm font-bold text-slate-800">{counts[key].toLocaleString()}</p>
              </div>
            ))}
          </div>
          {counts.stockItemsRestored > 0 && (
            <p className="text-[10px] text-[#434655]">
              Stock used by test sales is added back to {counts.stockItemsRestored} item
              {counts.stockItemsRestored === 1 ? '' : 's'}. Restocks and manual adjustments are kept.
            </p>
          )}
          {counts.customersWithWalletBalance > 0 && (
            <p className="text-[10px] text-[#434655]">
              {counts.customersWithWalletBalance} customer wallet balance
              {counts.customersWithWalletBalance === 1 ? '' : 's'} will be reset to zero.
            </p>
          )}
        </div>
      )}

      {counts.customers > 0 && (
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={deleteCustomers}
            onChange={(e) => setDeleteCustomers(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-red-600 cursor-pointer"
          />
          <span className="text-[11px] text-[#121c28]">
            Also delete all {counts.customers.toLocaleString()} customers
            <span className="block text-[10px] text-[#434655]">
              Leave this off if the owner added real regulars during setup.
            </span>
          </span>
        </label>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="goLiveConfirm" className="text-[11px] text-[#434655]">
          Type <span className="font-bold text-[#121c28]">{org.name}</span> to confirm
        </Label>
        <input
          id="goLiveConfirm"
          value={confirmName}
          onChange={(e) => setConfirmName(e.target.value)}
          autoComplete="off"
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500/20"
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={goLiveMutation.isPending}
          className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold min-h-[40px]"
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={() => goLiveMutation.mutate()}
          disabled={!nameMatches || goLiveMutation.isPending}
          className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold min-h-[40px] disabled:opacity-50"
        >
          {goLiveMutation.isPending ? 'Clearing…' : 'Delete test data and go live'}
        </Button>
      </div>
    </div>
  )
}
