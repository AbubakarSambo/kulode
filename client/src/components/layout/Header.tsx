import React from 'react'

interface HeaderProps {
  title: string
  description?: string
  action?: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
  badgeText?: string | number
  category?: string | React.ReactNode
}

export function Header({ title, description, action, icon: Icon, badgeText, category }: HeaderProps) {
  return (
    <div className="hidden sm:flex flex-col gap-3 border-b border-[#eef4ff]/50 bg-white/70 backdrop-blur-md px-4 py-3.5 sm:px-6 sm:py-5 sm:flex-row sm:items-center sm:justify-between shrink-0">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-[16px] bg-[#0037b0]/5 text-[#0037b0] flex items-center justify-center shadow-[0_4px_12px_rgba(0,55,176,0.02)] border border-[#0037b0]/5 shrink-0">
            <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
        )}
        <div className="min-w-0">
          {category && (
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#0037b0]/60 mb-0.5 block hidden sm:block">
              {category}
            </span>
          )}
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
            {badgeText !== undefined && badgeText !== null && (
              <span className="inline-flex items-center rounded-full bg-[#eef4ff] px-2 py-0.5 sm:px-2.5 sm:py-0.5 text-xs font-bold text-[#0037b0]">
                {badgeText}
              </span>
            )}
          </div>
          {description && (
            <p className="mt-0.5 text-xs font-medium text-slate-400 hidden sm:block">{description}</p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0 hidden sm:block">{action}</div>}
    </div>
  )
}
