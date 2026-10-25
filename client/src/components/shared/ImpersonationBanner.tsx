import { Eye, Loader2, LogOut } from 'lucide-react'
import { useAuthStore } from '@/stores/auth'
import { useExitImpersonation } from '@/hooks/useImpersonation'

// Pinned above every page while a platform admin is in a "View as" session, so it's impossible
// to forget whose org you're looking at.
export function ImpersonationBanner() {
  const user = useAuthStore((state) => state.user)
  const exit = useExitImpersonation()

  if (!user?.impersonation) return null

  const expiresAt = new Date(user.impersonation.expiresAt)

  return (
    // Stacked above every full-screen overlay (what's-new, modals) so Exit can never be
    // covered up and leave the admin stranded in someone else's org.
    <div className="relative z-[10000] flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-violet-500/30 bg-violet-600 px-4 py-2 text-sm text-white print:hidden">
      <Eye className="h-4 w-4 shrink-0" />
      <span>
        Viewing <span className="font-semibold">{user.organizationName}</span> as Super Admin
        <span className="mx-2 rounded bg-white/20 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide">
          Read-only
        </span>
        <span className="text-white/75">
          until {expiresAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
        </span>
      </span>
      <button
        type="button"
        onClick={() => exit.mutate()}
        disabled={exit.isPending}
        className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-50 disabled:cursor-wait disabled:opacity-70"
      >
        {exit.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
        Exit
      </button>
    </div>
  )
}
