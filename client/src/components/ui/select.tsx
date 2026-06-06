import * as React from 'react'
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
            'flex h-11 w-full appearance-none rounded-xl border border-input bg-card pl-4 pr-10 py-2 text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0037b0]/10 focus-visible:border-[#0037b0] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer text-slate-700 font-medium',
            error && 'border-destructive focus-visible:ring-destructive/20 focus-visible:border-destructive',
            className
          )}
          ref={ref}
          {...props}
        >
          {children}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-slate-400">
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
    )
  }
)
Select.displayName = 'Select'

export { Select }
