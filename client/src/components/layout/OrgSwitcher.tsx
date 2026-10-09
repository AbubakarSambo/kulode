import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronsUpDown, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth'
import { useMyOrganizations, useSwitchOrganization } from '@/hooks'

// Renders inline where the org name already shows in the sidebar's user card. Only becomes an
// interactive dropdown once the user actually has more than one membership — most accounts never
// will, so this stays a plain label for them with zero extra network chatter beyond the one
// lightweight /auth/my-organizations fetch (cached 60s, see useMyOrganizations).
//
// The panel is portaled to document.body (same pattern as searchable-select.tsx) rather than
// rendered inline: the sidebar's user-card name wrapper is `overflow-hidden` (it exists to
// truncate long names/org names), which would silently clip an absolutely-positioned child panel.
export function OrgSwitcher() {
  const [isOpen, setIsOpen] = useState(false)
  const [rect, setRect] = useState<{ top: number; bottom: number; left: number; width: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const user = useAuthStore((state) => state.user)
  const { data: organizations } = useMyOrganizations()
  const switchOrg = useSwitchOrganization()

  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        !(triggerRef.current && triggerRef.current.contains(target)) &&
        !(panelRef.current && panelRef.current.contains(target))
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  useLayoutEffect(() => {
    if (!isOpen) return
    const updateRect = () => {
      if (!triggerRef.current) return
      const r = triggerRef.current.getBoundingClientRect()
      setRect({ top: r.top, bottom: r.bottom, left: r.left, width: r.width })
    }
    updateRect()
    window.addEventListener('scroll', updateRect, true)
    window.addEventListener('resize', updateRect)
    return () => {
      window.removeEventListener('scroll', updateRect, true)
      window.removeEventListener('resize', updateRect)
    }
  }, [isOpen])

  if (!organizations || organizations.length <= 1) {
    return (
      <p className="truncate text-[10px] font-semibold text-slate-400 mt-0.5">
        {user?.organizationName}
      </p>
    )
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setIsOpen((prev) => !prev)
        }}
        disabled={switchOrg.isPending}
        className="flex items-center gap-1 text-[10px] font-semibold text-slate-400 hover:text-[#0037b0] transition-colors mt-0.5 cursor-pointer disabled:cursor-wait"
      >
        <span className="truncate">{user?.organizationName}</span>
        {switchOrg.isPending ? (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
        ) : (
          <ChevronsUpDown className="h-3 w-3 shrink-0" />
        )}
      </button>

      {isOpen && rect && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', left: rect.left, bottom: window.innerHeight - rect.top + 6, width: 224 }}
          className="z-[9995] rounded-xl border border-slate-200/80 bg-white p-1.5 shadow-[0px_12px_32px_rgba(0,55,176,0.08)] animate-in fade-in slide-in-from-bottom-1 duration-150"
        >
          <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Switch organization
          </p>
          {organizations.map((org) => (
            <button
              key={org.organizationId}
              type="button"
              disabled={switchOrg.isPending}
              onClick={() => {
                setIsOpen(false)
                if (org.organizationId !== user?.organizationId) {
                  switchOrg.mutate(org.organizationId)
                }
              }}
              className={cn(
                'w-full flex items-center justify-between gap-2 text-left px-3 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:cursor-wait',
                org.organizationId === user?.organizationId
                  ? 'bg-[#0037b0]/5 text-[#0037b0]'
                  : 'text-slate-700 hover:bg-slate-50',
              )}
            >
              <span className="truncate">{org.organizationName}</span>
              {org.organizationId === user?.organizationId && <Check className="h-3.5 w-3.5 shrink-0" />}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}
