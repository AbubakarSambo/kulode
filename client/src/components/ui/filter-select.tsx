import * as React from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowDown01Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'

export interface FilterSelectOption {
  value: string
  label: string
}

export interface FilterSelectProps {
  value: string
  onChange: (value: string) => void
  options: FilterSelectOption[]
  placeholder?: string
  className?: string
  id?: string
}

/**
 * FilterSelect — design-system-aligned custom dropdown.
 * Replaces native <select> in filter bars and form controls.
 *
 * Design tokens used:
 *  - Trigger border: outline-variant at 40% opacity (#c4c5d7 @ 40%)
 *  - Panel shadow: ambient primary shadow rgba(0,55,176,0.08)
 *  - Hover: surface-container-low (#eef4ff)
 *  - Selected: primary text (#0037b0) + Tick icon
 *  - Body text: on-surface (#121c28) / body (#434655)
 */
const FilterSelect = React.forwardRef<HTMLDivElement, FilterSelectProps>(
  ({ value, onChange, options, placeholder = 'Select…', className, id }, ref) => {
    const [isOpen, setIsOpen] = React.useState(false)
    const containerRef = React.useRef<HTMLDivElement>(null)

    const selectedOption = options.find((o) => o.value === value)
    const displayLabel = selectedOption?.label ?? placeholder

    // Close on outside click
    React.useEffect(() => {
      if (!isOpen) return
      const handler = (e: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          setIsOpen(false)
        }
      }
      document.addEventListener('mousedown', handler)
      return () => document.removeEventListener('mousedown', handler)
    }, [isOpen])

    // Close on Escape
    React.useEffect(() => {
      if (!isOpen) return
      const handler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setIsOpen(false)
      }
      document.addEventListener('keydown', handler)
      return () => document.removeEventListener('keydown', handler)
    }, [isOpen])

    const handleSelect = (optionValue: string) => {
      onChange(optionValue)
      setIsOpen(false)
    }

    return (
      <div ref={containerRef} className={cn('relative w-full', className)}>
        {/* Trigger */}
        <button
          id={id}
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          className={cn(
            // Layout & sizing — matches Input / Select height
            'flex h-11 w-full items-center justify-between gap-2 rounded-xl px-4',
            // Design system surface + ghost border at 40% opacity
            'bg-white border border-[rgba(196,197,215,0.4)]',
            // Typography
            'text-sm font-medium',
            // Color: placeholder vs selected
            selectedOption ? 'text-[#121c28]' : 'text-[#c4c5d7]',
            // Focus ring — primary tinted
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0037b0]/10 focus-visible:border-[#0037b0]',
            // Open state: highlight border
            isOpen && 'border-[#0037b0]/30 ring-2 ring-[#0037b0]/10',
            'cursor-pointer transition-all duration-150',
          )}
        >
          <span className="truncate">{displayLabel}</span>
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            size={15}
            strokeWidth={2}
            color="currentColor"
            className={cn(
              'shrink-0 text-[#c4c5d7] transition-transform duration-200',
              isOpen && 'rotate-180 text-[#0037b0]',
            )}
          />
        </button>

        {/* Dropdown panel */}
        {isOpen && (
          <div
            ref={ref}
            role="listbox"
            className={cn(
              // Positioning
              'absolute left-0 right-0 top-[calc(100%+6px)] z-50',
              // Surface
              'bg-white rounded-xl p-1.5',
              // Ghost border
              'border border-[rgba(196,197,215,0.3)]',
              // Ambient primary shadow — never pure black per DESIGN.md rule
              'shadow-[0px_16px_40px_rgba(0,55,176,0.10)]',
              // Entrance animation
              'animate-in fade-in slide-in-from-top-2 duration-150',
            )}
          >
            {options.map((option) => {
              const isSelected = option.value === value
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(option.value)}
                  className={cn(
                    // Layout
                    'flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left',
                    // Typography
                    'text-sm font-medium',
                    // Default state
                    'text-[#434655]',
                    // Hover — surface-container-low
                    'hover:bg-[#eef4ff] hover:text-[#121c28]',
                    // Selected — primary accent
                    isSelected && 'bg-[#eef4ff] text-[#0037b0] font-semibold',
                    'cursor-pointer transition-colors duration-100',
                    // Min touch target
                    'min-h-[36px]',
                  )}
                >
                  <span>{option.label}</span>
                  {isSelected && (
                    <HugeiconsIcon
                      icon={Tick02Icon}
                      size={14}
                      strokeWidth={2.5}
                      className="shrink-0 text-[#0037b0]"
                    />
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }
)

FilterSelect.displayName = 'FilterSelect'

export { FilterSelect }
