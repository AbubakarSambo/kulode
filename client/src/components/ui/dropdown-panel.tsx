import * as React from 'react'
import { cn } from '@/lib/utils'

export interface DropdownPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  isOpen: boolean
  onClose: () => void
  align?: 'left' | 'right'
  widthClass?: string
  zIndexClass?: string
  animateDirection?: 'top' | 'bottom'
}

const DropdownPanel = React.forwardRef<HTMLDivElement, DropdownPanelProps>(
  (
    {
      isOpen,
      onClose,
      align = 'right',
      widthClass = 'w-48',
      zIndexClass = 'z-40',
      animateDirection = 'top',
      className,
      children,
      ...props
    },
    ref
  ) => {
    if (!isOpen) return null

    // Determine overlay z-index (usually just below the dropdown)
    // z-40 -> z-35, z-20 -> z-15
    const getOverlayZIndex = (zClass: string) => {
      switch (zClass) {
        case 'z-50':
          return 'z-45'
        case 'z-40':
          return 'z-35'
        case 'z-30':
          return 'z-25'
        case 'z-20':
          return 'z-15'
        default:
          return 'z-30'
      }
    }

    const overlayZ = getOverlayZIndex(zIndexClass)

    return (
      <>
        {/* Backdrop for click outside */}
        <div
          className={cn('fixed inset-0 cursor-default bg-transparent', overlayZ)}
          onClick={onClose}
        />

        {/* Dropdown panel */}
        <div
          ref={ref}
          className={cn(
            'absolute mt-2 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-1.5 shadow-[0px_12px_32px_rgba(0,55,176,0.08)] text-left focus:outline-none focus-visible:outline-none',
            align === 'right' ? 'right-0' : 'left-0',
            animateDirection === 'top' ? 'animate-in fade-in slide-in-from-top-1' : 'animate-in fade-in slide-in-from-bottom-1',
            'duration-150',
            widthClass,
            zIndexClass,
            className
          )}
          {...props}
        >
          {children}
        </div>
      </>
    )
  }
)

DropdownPanel.displayName = 'DropdownPanel'

export { DropdownPanel }
