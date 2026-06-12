import { createPortal } from 'react-dom'
import { Button } from './button'
import { X } from 'lucide-react'

interface ConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: string
  confirmText?: string
  cancelText?: string
  isDangerous?: boolean
  isLoading?: boolean
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDangerous = false,
  isLoading = false,
}: ConfirmDialogProps) {
  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300"
        onClick={isLoading ? undefined : onClose}
      />

      {/* Modal Dialog Card */}
      <div className="relative w-full max-w-md transform overflow-hidden rounded-[28px] bg-white border border-slate-200/40 p-6 shadow-[0px_12px_32px_rgba(0,55,176,0.12)] transition-all animate-in fade-in zoom-in-95 duration-200 z-50">
        
        {/* Close Button */}
        {!isLoading && (
          <button
            onClick={onClose}
            className="absolute right-5 top-5 rounded-full p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-all cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close"
          >
            <X size={16} strokeWidth={2} />
          </button>
        )}

        {/* Content */}
        <div className="mt-2 text-left pr-8">
          <h3 className="text-lg font-black text-slate-900 leading-tight">
            {title}
          </h3>
          <p className="mt-3 text-xs font-semibold text-slate-500 leading-relaxed">
            {description}
          </p>
        </div>

        {/* Footer Actions */}
        <div className="mt-6 flex flex-row items-center justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={isLoading}
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-650 active:scale-98 transition-all min-h-[44px]"
          >
            {cancelText}
          </Button>
          <Button
            type="button"
            disabled={isLoading}
            onClick={onConfirm}
            className={isDangerous 
              ? "px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold active:scale-98 transition-all min-h-[44px] border-0"
              : "px-5 py-2.5 rounded-xl bg-[#0037b0] hover:bg-[#0037b0]/90 text-white text-xs font-extrabold active:scale-98 transition-all min-h-[44px] border-0"
            }
            isLoading={isLoading}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
