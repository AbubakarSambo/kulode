import { Link } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from './button'

interface EmptyStateProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any
  title: string
  description?: string
  actionLabel?: string
  actionHref?: string
  onAction?: () => void
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Icon unit with premium float and slow-rotating dashed ring */}
      <div className="relative mb-6 flex items-center justify-center float-slow">
        {/* Glow backdrop */}
        <div className="absolute h-24 w-24 rounded-full bg-[#0037b0]/5 blur-xl" />
        
        {/* Outer dashed spinning boundary */}
        <div className="absolute h-20 w-20 rounded-full border border-dashed border-[#0037b0]/20 animate-spin [animation-duration:24s]" />
        
        {/* Main icon container */}
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0037b0]/5 to-[#0037b0]/15 text-[#0037b0] border border-[#0037b0]/10 shadow-[0_4px_12px_rgba(0,55,176,0.02)]">
          <HugeiconsIcon 
            icon={icon} 
            size={28} 
            strokeWidth={1.5} 
            className="transition-transform duration-300 hover:scale-110" 
          />
        </div>
      </div>

      {/* Headings */}
      <h3 className="text-base font-bold text-[#121c28] tracking-tight mb-2">
        {title}
      </h3>
      
      {description && (
        <p className="text-xs font-semibold text-[#434655] max-w-xs leading-relaxed mb-6">
          {description}
        </p>
      )}

      {/* Action CTA */}
      {actionLabel && (
        <div>
          {actionHref ? (
            <Link to={actionHref}>
              <Button className="btn-gradient px-6 py-2.5 rounded-xl text-xs font-bold transition-all duration-300 cursor-pointer">
                {actionLabel}
              </Button>
            </Link>
          ) : (
            <Button 
              onClick={onAction}
              className="btn-gradient px-6 py-2.5 rounded-xl text-xs font-bold transition-all duration-300 cursor-pointer"
            >
              {actionLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
