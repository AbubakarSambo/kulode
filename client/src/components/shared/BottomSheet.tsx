import * as React from 'react'
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

export interface BottomSheetProps {
  isOpen: boolean
  onClose: () => void
  title: string
  onClearAll?: () => void
  children: React.ReactNode
  /** When false, the sheet renders on all screen sizes instead of only below the `md` breakpoint. Defaults to true. */
  mobileOnly?: boolean
  /** Extra classes for the sheet panel, e.g. to cap its width on larger screens. */
  panelClassName?: string
}

export function BottomSheet({
  isOpen,
  onClose,
  title,
  onClearAll,
  children,
  mobileOnly = true,
  panelClassName,
}: BottomSheetProps) {
  const [shouldRender, setShouldRender] = useState(isOpen)
  const [isAnimated, setIsAnimated] = useState(isOpen)

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true)
      const timer = setTimeout(() => {
        setIsAnimated(true)
      }, 10)
      return () => clearTimeout(timer)
    } else {
      setIsAnimated(false)
      const timer = setTimeout(() => {
        setShouldRender(false)
      }, 400) // matches transition duration
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  // Prevent scroll when open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow
      const originalHeight = document.body.style.height
      document.body.style.overflow = 'hidden'
      document.body.style.height = '100%'
      return () => {
        document.body.style.overflow = originalOverflow
        document.body.style.height = originalHeight
      }
    }
  }, [isOpen])

  if (!shouldRender) return null

  return createPortal(
    <div className={cn('fixed inset-0 z-50 flex items-end justify-center', mobileOnly && 'md:hidden')}>
      {/* Backdrop */}
      <div
        className={cn(
          "absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300 ease-out",
          isAnimated ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
      />

      {/* Content */}
      <div
        className={cn(
          "relative w-full max-h-[85vh] bg-white rounded-t-[32px] p-6 shadow-[0px_-12px_32px_rgba(0,55,176,0.12)] z-10 flex flex-col transition-all",
          isAnimated ? "translate-y-0 opacity-100" : "translate-y-full opacity-90",
          panelClassName,
        )}
        style={{
          transitionDuration: '400ms',
          transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Grabber indicator */}
        <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-4 shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between mb-6 shrink-0">
          <h3 className="text-base font-extrabold text-slate-900">{title}</h3>
          {onClearAll && (
            <button
              type="button"
              onClick={onClearAll}
              className="text-xs font-bold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
            >
              Clear All
            </button>
          )}
        </div>

        {/* Children */}
        {children}
      </div>
    </div>,
    document.body
  )
}
