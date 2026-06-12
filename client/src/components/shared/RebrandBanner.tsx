import { useState, useEffect } from 'react'
import { X, Info } from 'lucide-react'

export function RebrandBanner() {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // End date: July 12, 2026
    const endDate = new Date('2026-07-12T00:00:00Z')
    const isDismissed = localStorage.getItem('tari1-rebrand-banner-dismissed') === 'true'
    
    if (new Date() < endDate && !isDismissed) {
      setIsVisible(true)
    }
  }, [])

  const handleDismiss = () => {
    localStorage.setItem('tari1-rebrand-banner-dismissed', 'true')
    setIsVisible(false)
  }

  if (!isVisible) return null

  return (
    <div className="bg-[#0037b0] text-white px-4 py-2 flex items-center justify-between text-sm sm:text-base z-50">
      <div className="flex items-center gap-2 max-w-4xl mx-auto w-full justify-center text-center">
        <Info className="h-4 w-4 shrink-0 opacity-80" />
        <p className="font-medium">
          <span className="font-bold">Kulode is now Tari1.</span> In the coming weeks, our web address will automatically update to reflect our new brand.
        </p>
      </div>
      <button 
        onClick={handleDismiss}
        className="shrink-0 p-1 rounded-full hover:bg-white/20 transition-colors focus:outline-none"
        aria-label="Dismiss banner"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
