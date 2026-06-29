import { useState } from 'react'
import { Header } from '@/components/layout'
import { ArrowLeft, Terminal, Sparkles, ShieldCheck, Zap } from 'lucide-react'
import { Link } from 'react-router-dom'
import { changelogData, ChangelogEntry } from '@/lib/changelog'

// Extended history registry
const fullChangelogHistory: ChangelogEntry[] = [
  changelogData['1.1.0'],
  {
    version: '1.0.1',
    title: 'Visual Polish & Layout Adjustments',
    date: '2026-06-10',
    type: 'patch',
    features: [
      {
        title: 'High Contrast Adjustments',
        description: 'Refined visual rendering for high-contrast accessibility. Updated ghost borders to 20% opacity as per DESIGN.md specifications.',
        tag: 'UI Polish',
      },
      {
        title: 'Invoice PDF Generator Alignment',
        description: 'Fixed PDF overflow issues when invoices contained extremely long item descriptions.',
        tag: 'Bug Fix',
      },
    ],
  },
  {
    version: '1.0.0',
    title: 'Welcome to Tari',
    date: '2026-05-15',
    type: 'major',
    features: [
      {
        title: 'Multi-Tenant Financial Core',
        description: 'Launched isolated ledger and billing databases to support secure, organization-level multi-tenancy.',
        tag: 'New Feature',
      },
      {
        title: 'Paystack Payment Channels',
        description: 'Linked local card, USSD, and bank transfer rails directly into standard invoices.',
        tag: 'Payments',
      },
    ],
  },
]

export function ChangelogPage() {
  const [filter, setFilter] = useState<'all' | 'new' | 'perf' | 'fix'>('all')

  const getTagIcon = (tag: string) => {
    switch (tag.toLowerCase()) {
      case 'new feature':
        return <Sparkles size={12} className="text-[#006c49]" />
      case 'performance':
        return <Zap size={12} className="text-[#0037b0]" />
      case 'security':
      case 'stability':
        return <ShieldCheck size={12} className="text-[#ba1a1a]" />
      default:
        return <Terminal size={12} className="text-[#434655]" />
    }
  }

  const filteredHistory = fullChangelogHistory.map(entry => {
    const filteredFeatures = entry.features.filter(feature => {
      if (filter === 'all') return true
      if (filter === 'new' && feature.tag.toLowerCase().includes('new')) return true
      if (filter === 'perf' && feature.tag.toLowerCase().includes('perf')) return true
      if (filter === 'fix' && (feature.tag.toLowerCase().includes('fix') || feature.tag.toLowerCase().includes('polish'))) return true
      return false
    })
    return { ...entry, features: filteredFeatures }
  }).filter(entry => entry.features.length > 0)

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[#f8f9ff]">
      {/* Editorial Header */}
      <Header
        title="System Updates"
        description="Chronological log of platform enhancements and ledger adjustments."
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6 max-w-4xl w-full mx-auto">
        {/* Navigation Breadcrumb */}
        <div className="mb-6">
          <Link 
            to="/settings" 
            className="inline-flex items-center gap-2 text-xs font-bold text-[#0037b0] hover:text-[#1d4ed8] transition-colors"
          >
            <ArrowLeft size={14} />
            Back to Settings
          </Link>
        </div>

        {/* Filter Controls (No borders sectioning, spaces & buttons layout) */}
        <div className="flex flex-wrap gap-2 mb-8">
          {(['all', 'new', 'perf', 'fix'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className={`px-4 py-2 rounded-[8px] text-[10px] font-bold transition-all min-h-[36px] cursor-pointer ${
                filter === type
                  ? 'bg-gradient-to-r from-[#0037b0] to-[#1d4ed8] text-white shadow-[0px_8px_20px_rgba(0,55,176,0.06)]'
                  : 'bg-[#ffffff] text-[#434655] hover:bg-[#eef4ff] border border-[#c4c5d7]/20'
              }`}
            >
              {type === 'all' && 'All Updates'}
              {type === 'new' && 'New Features'}
              {type === 'perf' && 'Performance'}
              {type === 'fix' && 'Fixes & Polish'}
            </button>
          ))}
        </div>

        {/* Timeline Stack (Editorial vertical structure) */}
        <div className="flex flex-col gap-6">
          {filteredHistory.map((entry) => (
            <div 
              key={entry.version}
              className="p-6 rounded-[20px] bg-[#ffffff] shadow-[0px_12px_32px_rgba(0,55,176,0.04)] hover:shadow-[0px_12px_32px_rgba(0,55,176,0.08)] transition-all duration-200"
            >
              {/* Version Banner */}
              <div className="flex flex-wrap items-baseline justify-between gap-2 pb-4">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] tracking-wider uppercase font-bold text-[#0037b0] bg-[#eef4ff] px-2.5 py-0.5 rounded-full">
                    v{entry.version}
                  </span>
                  <h3 className="text-base font-bold text-[#121c28]">
                    {entry.title}
                  </h3>
                </div>
                <span className="text-[10px] font-semibold text-[#434655]">
                  {new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>

              {/* Spacing shift block for list (instead of borders) */}
              <div className="mt-4 flex flex-col gap-4">
                {entry.features.map((feature, idx) => (
                  <div 
                    key={idx} 
                    className="p-4 rounded-[12px] bg-[#f8f9ff] flex flex-col items-start gap-1"
                  >
                    <div className="flex items-center gap-1.5">
                      <div className="flex p-1 rounded-full bg-[#ffffff] shadow-[0px_4px_12px_rgba(0,55,176,0.03)]">
                        {getTagIcon(feature.tag)}
                      </div>
                      <span className="text-[9px] font-bold text-[#434655] uppercase tracking-wider">
                        {feature.tag}
                      </span>
                    </div>
                    <h4 className="text-xs font-bold text-[#121c28] mt-1">{feature.title}</h4>
                    <p className="text-[11px] font-semibold text-[#434655] leading-relaxed mt-0.5">
                      {feature.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {filteredHistory.length === 0 && (
            <div className="p-12 text-center rounded-[20px] bg-[#ffffff] shadow-[0px_12px_32px_rgba(0,55,176,0.04)]">
              <p className="text-xs font-semibold text-[#434655]">No releases match the selected filter.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
