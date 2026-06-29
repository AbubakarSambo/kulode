import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { changelogData } from '@/lib/changelog'

interface WhatsNewModalProps {
  isOpen: boolean
  onClose: () => void
  version: string
}

export function WhatsNewModal({ isOpen, onClose, version }: WhatsNewModalProps) {
  if (!isOpen) return null

  const entry = changelogData[version] || changelogData['1.1.0'] // fallback to latest known entry

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop with slight blur */}
      <div 
        className="fixed inset-0 bg-[#121c28]/40 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Spotlight Card */}
      <div className="relative w-full max-w-lg transform overflow-hidden rounded-[24px] bg-[#ffffff] p-8 shadow-[0px_12px_32px_rgba(0,55,176,0.08)] transition-all animate-in fade-in zoom-in-95 duration-350 ease-out z-50">
        
        {/* Close button with min touch target */}
        <button
          onClick={onClose}
          className="absolute right-6 top-6 rounded-full p-2 text-[#434655] hover:bg-[#eef4ff] hover:text-[#121c28] transition-all cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Close dialog"
        >
          <X size={18} strokeWidth={2} />
        </button>

        {/* Header - Editorial Hierarchy */}
        <div className="text-left pr-8">
          <span className="text-[10px] tracking-wider uppercase font-semibold text-[#0037b0] bg-[#eef4ff] px-2.5 py-1 rounded-full">
            Update v{entry.version}
          </span>
          <h3 className="mt-3 text-xl font-bold text-[#121c28] leading-tight">
            {entry.title}
          </h3>
          <p className="mt-1 text-xs font-semibold text-[#434655]">
            Released on {new Date(entry.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>

        {/* Feature Cards List (No borders - spacing & background shift sectioning) */}
        <div className="mt-6 flex flex-col gap-4 max-h-[320px] overflow-y-auto pr-1">
          {entry.features.map((feature, idx) => (
            <div 
              key={idx} 
              className="p-4 rounded-[16px] bg-[#eef4ff] flex flex-col items-start gap-1.5 transition-transform duration-200 hover:translate-y-[-2px] hover:shadow-[0px_12px_32px_rgba(0,55,176,0.04)]"
            >
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold text-[#006c49] bg-[#6ffbbe] px-2 py-0.5 rounded-full uppercase tracking-wide">
                  {feature.tag}
                </span>
                <h4 className="text-xs font-bold text-[#121c28]">{feature.title}</h4>
              </div>
              <p className="text-[11px] font-semibold text-[#434655] leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>

        {/* Footer CTA */}
        <div className="mt-8 flex items-center justify-end">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-3 rounded-[12px] bg-gradient-to-r from-[#0037b0] to-[#1d4ed8] hover:from-[#0037b0]/95 hover:to-[#1d4ed8]/95 text-white text-xs font-bold active:scale-98 transition-all min-h-[44px] cursor-pointer shadow-[0px_12px_32px_rgba(0,55,176,0.08)]"
          >
            Got it, let's explore
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
