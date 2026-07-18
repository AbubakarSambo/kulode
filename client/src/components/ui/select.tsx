import * as React from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: string
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error, children, ...props }, ref) => {
    return (
      <div className="w-full relative">
        <select
          className={cn(
            // Design system: h-11 touch target, xl radius (1.5rem), ghost border at 40% opacity
            // surface-container-lowest bg (#ffffff), on-surface text (#121c28), medium weight
            'flex h-11 w-full appearance-none rounded-xl border border-[rgba(196,197,215,0.4)] bg-white pl-4 pr-10 py-2 text-[16px] sm:text-sm font-medium text-[#121c28] transition-all',
            // Focus: primary ring, primary border — no box-shadow pollution
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0037b0]/10 focus-visible:border-[#0037b0]',
            // Disabled state
            'disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer',
            // Error state
            error && 'border-[#ba1a1a] focus-visible:ring-[#ba1a1a]/20 focus-visible:border-[#ba1a1a]',
            className
          )}
          ref={ref}
          {...props}
        >
          {children}
        </select>
        {/* Hugeicons chevron — consistent with the rest of the icon system */}
        <div className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-[#c4c5d7]">
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            size={16}
            strokeWidth={2}
            color="currentColor"
          />
        </div>
        {error && <p className="mt-1 text-xs text-[#ba1a1a]">{error}</p>}
      </div>
    )
  }
)
Select.displayName = 'Select'

export { Select }
