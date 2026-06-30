import { AlertCircle } from 'lucide-react'

interface ReloadBannerProps {
  isVisible: boolean
  latestVersion: string
}

export function ReloadBanner({ isVisible, latestVersion }: ReloadBannerProps) {
  if (!isVisible) return null

  const handleReload = () => {
    // Prevent accidental data loss in case the user has half-filled forms in the active tab
    const confirmRefresh = window.confirm(
      `Tari is updating to version ${latestVersion}.\n\nAny unsaved changes on this page will be lost. Would you like to reload now to access the updated platform?`
    )
    if (confirmRefresh) {
      // Clear version history memory to prevent ghost loops
      localStorage.removeItem('last_seen_version')
      
      // Cache-busting reload (Future-proof for PWA and aggressive CDNs)
      const currentUrl = new URL(window.location.href)
      currentUrl.searchParams.set('v', Date.now().toString())
      window.location.href = currentUrl.toString()
    }
  }

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-lg animate-in slide-in-from-top-12 duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]">
      <div className="flex items-center justify-between gap-4 p-4 rounded-[16px] bg-[#ffffff]/70 backdrop-blur-[12px] border border-[#c4c5d7]/20 shadow-[0px_12px_32px_rgba(0,55,176,0.08)] transition-transform duration-200 hover:translate-y-[2px]">
        {/* Banner Details */}
        <div className="flex items-center gap-3">
          <div className="flex p-1.5 rounded-full bg-[#eef4ff] text-[#0037b0]">
            <AlertCircle size={16} />
          </div>
          <div className="text-left">
            <h4 className="text-xs font-bold text-[#121c28]">App Update Available</h4>
            <p className="text-[10px] font-semibold text-[#434655]">
              Version {latestVersion} is ready with fresh improvements.
            </p>
          </div>
        </div>

        {/* Reload CTA */}
        <button
          onClick={handleReload}
          className="px-4 py-2 text-[10px] font-bold text-white rounded-[8px] bg-gradient-to-r from-[#0037b0] to-[#1d4ed8] hover:from-[#0037b0]/95 hover:to-[#1d4ed8]/95 active:scale-98 transition-all min-h-[36px] cursor-pointer shadow-[0px_8px_20px_rgba(0,55,176,0.06)]"
        >
          Reload App
        </button>
      </div>
    </div>
  )
}
