import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Eye, EyeOff } from 'lucide-react'
import { posDashboardApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { can } from '@/lib/permissions'
import { formatCurrency } from '@/lib/utils'

const HIDDEN_KEY = 'todayTakingsHidden'

function readHidden(): boolean {
  try {
    return localStorage.getItem(HIDDEN_KEY) === '1'
  } catch {
    return false
  }
}

// Today's running takings for this branch, so floor staff can see where the day stands without
// opening a report — paid, still open, and the two together. Refreshes on the same 15s cadence as
// the rest of the POS. The eye toggle masks the amounts for a screen that faces customers (e.g. a
// retail till), and is remembered per device. Only shown once the org turns it on in settings.
export function TodayTakingsStrip() {
  const user = useAuthStore((state) => state.user)
  const allowed = can(user, 'TODAY_TAKINGS_VIEW')
  const [hidden, setHidden] = useState(readHidden)

  const { data } = useQuery({
    // Keyed by org so switching branches never flashes the previous branch's figures
    queryKey: ['pos-dashboard', 'today', user?.organizationId],
    queryFn: () => posDashboardApi.getTodayTakings(),
    enabled: allowed,
    // Turned off: check back now and then so switching it on in settings shows up without a reload
    refetchInterval: (query) => (query.state.data?.enabled ? 15_000 : 60_000),
  })

  if (!allowed || !data?.enabled) return null

  const toggle = () => {
    setHidden(!hidden)
    try {
      localStorage.setItem(HIDDEN_KEY, hidden ? '0' : '1')
    } catch {
      // Private mode / blocked storage — the toggle still works for this session
    }
  }

  const amount = (n: number) => (hidden ? '₦•••' : formatCurrency(n))

  return (
    <div className="flex items-center gap-x-4 gap-y-1 flex-wrap border-b border-border bg-muted/50 px-4 py-1.5 text-xs print:hidden">
      <span className="font-semibold text-muted-foreground">Today</span>
      <span>
        <span className="text-muted-foreground">Paid </span>
        <span className="font-semibold text-foreground tabular-nums">{amount(data.paid.amount)}</span>
        <span className="text-muted-foreground"> · {data.paid.count}</span>
      </span>
      <span>
        <span className="text-muted-foreground">Open </span>
        <span className="font-semibold text-foreground tabular-nums">{amount(data.open.amount)}</span>
        <span className="text-muted-foreground"> · {data.open.count}</span>
      </span>
      <span>
        <span className="text-muted-foreground">Total </span>
        <span className="font-bold text-[#0037b0] tabular-nums">{amount(data.total)}</span>
      </span>
      <button
        type="button"
        onClick={toggle}
        aria-label={hidden ? "Show today's takings" : "Hide today's takings"}
        className="ml-auto rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        {hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}
