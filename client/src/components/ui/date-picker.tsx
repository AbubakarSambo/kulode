import React, { useState, useEffect, useRef } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Calendar03Icon,
  ArrowLeft02Icon,
  ArrowRight02Icon,
  ArrowDown01Icon,
} from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'

interface DatePickerProps {
  value?: string // YYYY-MM-DD
  onChange: (value: string) => void
  error?: string
  placeholder?: string
  className?: string
  align?: 'left' | 'right'
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

function isSameDay(d1: Date, d2: Date) {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  )
}

function formatDateToYmd(d: Date) {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDisplayDate(ymdString: string) {
  if (!ymdString) return ''
  const parts = ymdString.split('-')
  if (parts.length !== 3) return ymdString
  const [year, month, day] = parts
  return `${day}/${month}/${year}`
}

export function DatePicker({
  value = '',
  onChange,
  error,
  placeholder = 'Select date',
  className,
  align = 'left',
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Parse initial month and year from value if present
  const getInitialMonthAndYear = () => {
    if (value) {
      const parts = value.split('-')
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10)
        const m = parseInt(parts[1], 10) - 1
        if (!isNaN(y) && !isNaN(m)) {
          return { month: m, year: y }
        }
      }
    }
    return { month: new Date().getMonth(), year: new Date().getFullYear() }
  }

  const initialDate = getInitialMonthAndYear()

  // Calendar navigation state (month is 0-indexed)
  const [currentMonth, setCurrentMonth] = useState(initialDate.month)
  const [currentYear, setCurrentYear] = useState(initialDate.year)

  const toggleOpen = () => {
    if (!open && value) {
      const parts = value.split('-')
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10)
        const m = parseInt(parts[1], 10) - 1
        if (!isNaN(y) && !isNaN(m)) {
          setCurrentMonth(m)
          setCurrentYear(y)
        }
      }
    }
    setOpen(!open)
  }

  // Close calendar popover on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Navigation handlers
  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11)
      setCurrentYear((prev) => prev - 1)
    } else {
      setCurrentMonth((prev) => prev - 1)
    }
  }

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0)
      setCurrentYear((prev) => prev + 1)
    } else {
      setCurrentMonth((prev) => prev + 1)
    }
  }

  // Generate calendar cells (6 weeks = 42 cells)
  const getCalendarCells = () => {
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1)
    const firstDayIndex = firstDayOfMonth.getDay()
    // Align Sunday (0) to index 6, Monday (1) to index 0
    const startOffset = firstDayIndex === 0 ? 6 : firstDayIndex - 1

    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()
    const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate()

    const cells: { date: Date; isCurrentMonth: boolean }[] = []

    // Trailing days from previous month
    for (let i = startOffset - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i
      const prevM = currentMonth === 0 ? 11 : currentMonth - 1
      const prevY = currentMonth === 0 ? currentYear - 1 : currentYear
      cells.push({ date: new Date(prevY, prevM, d), isCurrentMonth: false })
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: new Date(currentYear, currentMonth, d), isCurrentMonth: true })
    }

    // Leading days from next month
    const remaining = 42 - cells.length
    for (let d = 1; d <= remaining; d++) {
      const nextM = currentMonth === 11 ? 0 : currentMonth + 1
      const nextY = currentMonth === 11 ? currentYear + 1 : currentYear
      cells.push({ date: new Date(nextY, nextM, d), isCurrentMonth: false })
    }

    return cells
  }

  const handleSelectDay = (date: Date) => {
    onChange(formatDateToYmd(date))
    setOpen(false)
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange('')
    setOpen(false)
  }

  const handleToday = (e: React.MouseEvent) => {
    e.stopPropagation()
    const today = new Date()
    onChange(formatDateToYmd(today))
    setOpen(false)
  }

  const cells = getCalendarCells()
  const displayValue = formatDisplayDate(value)
  const todayDate = new Date()

  return (
    <div ref={containerRef} className={cn('relative w-full', open && 'z-50', className)}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={toggleOpen}
        className={cn(
          'flex h-11 w-full items-center justify-between rounded-xl border border-input bg-card pl-11 pr-4 py-2 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-[#0037b0]/10 focus:border-[#0037b0] select-none text-left cursor-pointer min-h-[44px]',
          error && 'border-destructive focus:ring-destructive/20 focus:border-destructive',
          !displayValue && 'text-slate-400/70',
          displayValue && 'text-slate-800 font-medium'
        )}
      >
        <span className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center justify-center">
          <HugeiconsIcon icon={Calendar03Icon} size={20} strokeWidth={1.5} className="text-slate-400" />
        </span>
        <span className="truncate">{displayValue || placeholder}</span>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          size={16}
          strokeWidth={1.5}
          className={cn('text-slate-400/80 transition-transform duration-200 ml-2', open && 'rotate-180')}
        />
      </button>

      {/* Error Message */}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}

      {/* Popover Calendar Card */}
      {open && (
        <div className={cn(
          "absolute mt-2 w-72 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-[0px_12px_32px_rgba(0,55,176,0.08)] z-50 animate-in fade-in slide-in-from-top-2 duration-150",
          align === 'right' ? 'right-0' : 'left-0'
        )}>
          {/* Header Month/Year selector */}
          <div className="flex items-center justify-between mb-4 px-1">
            <span className="text-sm font-bold text-slate-800 tracking-tight">
              {MONTHS[currentMonth]} {currentYear}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={prevMonth}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100/70 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
              >
                <HugeiconsIcon icon={ArrowLeft02Icon} size={16} strokeWidth={1.5} />
              </button>
              <button
                type="button"
                onClick={nextMonth}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100/70 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
              >
                <HugeiconsIcon icon={ArrowRight02Icon} size={16} strokeWidth={1.5} />
              </button>
            </div>
          </div>

          {/* Weekdays Grid */}
          <div className="grid grid-cols-7 gap-y-1 mb-2 text-center">
            {WEEKDAYS.map((day) => (
              <span key={day} className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                {day}
              </span>
            ))}
          </div>

          {/* Calendar Days Matrix */}
          <div className="grid grid-cols-7 gap-y-1 text-center">
            {cells.map(({ date, isCurrentMonth }, idx) => {
              const cellYmd = formatDateToYmd(date)
              const isSelected = value === cellYmd
              const isToday = isSameDay(date, todayDate)

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectDay(date)}
                  className={cn(
                    'w-9 h-9 text-xs font-semibold flex items-center justify-center rounded-lg transition-all mx-auto cursor-pointer relative',
                    // Selected state
                    isSelected && 'bg-[#0037b0] text-white font-bold rounded-xl shadow-sm shadow-[#0037b0]/10',
                    // Unselected states
                    !isSelected && [
                      isCurrentMonth ? 'text-slate-700 hover:bg-[#0037b0]/5 hover:text-[#0037b0]' : 'text-slate-300 hover:bg-[#0037b0]/5 hover:text-[#0037b0]',
                      isToday && 'text-[#0037b0] border border-[#0037b0]/20 font-bold'
                    ]
                  )}
                >
                  {date.getDate()}
                  {/* Subtle dot for today if not selected */}
                  {isToday && !isSelected && (
                    <span className="absolute bottom-1.5 w-1 h-1 rounded-full bg-[#0037b0]" />
                  )}
                </button>
              )
            })}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#eef4ff]/50 text-xs font-bold px-1 select-none">
            <button
              type="button"
              onClick={handleClear}
              className="text-slate-400 hover:text-slate-655 transition-colors cursor-pointer py-1 px-2 -ml-2 rounded-lg hover:bg-slate-50"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleToday}
              className="text-[#0037b0] hover:text-[#1d4ed8] transition-colors cursor-pointer py-1 px-2 -mr-2 rounded-lg hover:bg-slate-50"
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
