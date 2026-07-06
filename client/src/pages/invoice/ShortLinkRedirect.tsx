import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { AlertDiamondIcon, Clock01Icon } from '@hugeicons/core-free-icons'
import apiClient from '@/api/client'

export function ShortLinkRedirectPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) {
      setError('Invalid short link')
      return
    }

    const MAX_ATTEMPTS = 3
    let cancelled = false

    const resolveLink = async (attempt: number) => {
      try {
        const response = await apiClient.get<{ data: { targetUrl: string } }>(
          `/invoices/public/short-links/${slug}`
        )
        const targetUrl = response.data.data.targetUrl
        if (targetUrl) {
          window.location.replace(targetUrl)
        } else {
          setError('This payment link has expired or is invalid.')
        }
      } catch (err) {
        const status = (err as { response?: { status?: number } }).response?.status
        // 404 means the link is genuinely gone/expired — retrying won't help.
        // Anything else (network hiccup, 5xx, server mid-restart) is worth retrying.
        if (status !== 404 && attempt < MAX_ATTEMPTS) {
          setTimeout(() => {
            if (!cancelled) resolveLink(attempt + 1)
          }, 1000 * attempt)
          return
        }
        console.error('Failed to resolve short link:', err)
        setError('This payment link has expired or is invalid.')
      }
    }

    resolveLink(1)

    return () => {
      cancelled = true
    }
  }, [slug])

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#f8f9ff] p-4">
        <div className="rounded-2xl bg-white p-8 text-center shadow-[0px_12px_32px_rgba(0,55,176,0.08)] max-w-sm border border-slate-200/60">
          <div className="w-16 h-16 rounded-full bg-rose-50 flex items-center justify-center mx-auto mb-4">
            <HugeiconsIcon icon={AlertDiamondIcon} className="h-8 w-8 text-rose-500" />
          </div>
          <h1 className="text-lg font-bold text-[#121c28]">Payment Link Invalid</h1>
          <p className="mt-2 text-sm text-[#434655] leading-relaxed">
            {error}
          </p>
          <button
            type="button"
            onClick={() => navigate('/invoices')}
            className="mt-6 inline-flex items-center justify-center h-10 px-6 rounded-lg text-xs font-bold text-white cursor-pointer transition-all bg-[#0037b0] hover:bg-[#1d4ed8]"
          >
            Go to Invoices
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8f9ff] p-4">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="relative">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-[#0037b0]" />
          <div className="absolute inset-0 flex items-center justify-center">
            <HugeiconsIcon icon={Clock01Icon} className="h-5 w-5 text-[#0037b0]" />
          </div>
        </div>
        <div>
          <h2 className="text-sm font-bold text-[#121c28]">Securing connection…</h2>
          <p className="text-xs text-slate-400 font-semibold mt-1 uppercase tracking-wider">Redirecting you to checkout</p>
        </div>
      </div>
    </div>
  )
}
