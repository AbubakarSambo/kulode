import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Search01Icon,
  Delete02Icon,
  PencilEdit02Icon,
  PlusSignIcon,
  ArrowLeft02Icon,
  Invoice03Icon,
  Bookmark01Icon,
} from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'
import { type ChatSession } from '@/api/ai'
import { Modal } from '@/components/shared'
import { Button } from '@/components/ui'

interface ChatSidebarProps {
  sessions: ChatSession[]
  currentSessionId?: string
  onSelectSession: (id: string) => void
  onCreateSession: () => void
  onRenameSession: (id: string, newTitle: string) => void
  onDeleteSession: (id: string) => void
  onTogglePin: (id: string, isPinned: boolean) => void
  isOpen: boolean
  onClose: () => void
}

export function ChatSidebar({
  sessions,
  currentSessionId,
  onSelectSession,
  onCreateSession,
  onRenameSession,
  onDeleteSession,
  onTogglePin,
  isOpen,
  onClose,
}: ChatSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null)

  const startRename = (session: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingSessionId(session.id)
    setEditTitle(session.title)
  }

  const saveRename = (id: string) => {
    if (editTitle.trim()) {
      onRenameSession(id, editTitle.trim())
    }
    setEditingSessionId(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter') {
      saveRename(id)
    } else if (e.key === 'Escape') {
      setEditingSessionId(null)
    }
  }

  const filteredSessions = sessions.filter((s) =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const pinnedSessions = filteredSessions.filter((s) => s.isPinned)
  const recentSessions = filteredSessions.filter((s) => !s.isPinned)

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const sevenDaysAgo = new Date(today)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const thirtyDaysAgo = new Date(today)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const todaySessions: ChatSession[] = []
  const yesterdaySessions: ChatSession[] = []
  const previous7DaysSessions: ChatSession[] = []
  const previous30DaysSessions: ChatSession[] = []
  const olderSessions: ChatSession[] = []

  recentSessions.forEach((session) => {
    const d = new Date(session.updatedAt)
    if (d >= today) {
      todaySessions.push(session)
    } else if (d >= yesterday) {
      yesterdaySessions.push(session)
    } else if (d >= sevenDaysAgo) {
      previous7DaysSessions.push(session)
    } else if (d >= thirtyDaysAgo) {
      previous30DaysSessions.push(session)
    } else {
      olderSessions.push(session)
    }
  })

  const sortByDateDesc = (a: ChatSession, b: ChatSession) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  todaySessions.sort(sortByDateDesc)
  yesterdaySessions.sort(sortByDateDesc)
  previous7DaysSessions.sort(sortByDateDesc)
  previous30DaysSessions.sort(sortByDateDesc)
  olderSessions.sort(sortByDateDesc)

  const renderSessionItem = (session: ChatSession) => {
    const isActive = session.id === currentSessionId
    const isEditing = session.id === editingSessionId

    return (
      <div
        key={session.id}
        onClick={() => !isEditing && onSelectSession(session.id)}
        className={cn(
          'group relative flex items-center justify-between p-3 rounded-xl transition-all cursor-pointer select-none mb-1 text-sm min-h-[46px]',
          isActive
            ? 'bg-gradient-to-br from-[#0037b0]/8 to-[#1d4ed8]/4 text-[#0037b0] font-semibold'
            : 'text-slate-600 hover:bg-slate-100/50 hover:text-slate-900'
        )}
      >
        <div className="flex items-center gap-2.5 flex-1 min-w-0 pr-2">
          <HugeiconsIcon
            icon={Invoice03Icon}
            size={16}
            className={cn('shrink-0 opacity-70', isActive ? 'text-[#0037b0]' : 'text-slate-400')}
          />
          {isEditing ? (
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={() => saveRename(session.id)}
              onKeyDown={(e) => handleKeyDown(e, session.id)}
              autoFocus
              className="w-full bg-white border border-[#0037b0]/30 rounded px-2 py-0.5 text-[16px] sm:text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0037b0]"
            />
          ) : (
            <span className="truncate leading-relaxed">{session.title}</span>
          )}
        </div>

        {!isEditing && (
          <div className="flex items-center opacity-50 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onTogglePin(session.id, !session.isPinned)
              }}
              className="w-[36px] h-[44px] flex items-center justify-center hover:bg-white rounded hover:shadow-sm text-slate-400 hover:text-[#0037b0] transition-colors"
            >
              {session.isPinned ? (
                <HugeiconsIcon icon={Bookmark01Icon} size={16} className="text-[#0037b0]" />
              ) : (
                <HugeiconsIcon icon={Bookmark01Icon} size={16} />
              )}
            </button>
            <button
              onClick={(e) => startRename(session, e)}
              className="w-[36px] h-[44px] flex items-center justify-center hover:bg-white rounded hover:shadow-sm text-slate-400 hover:text-slate-700 transition-colors"
            >
              <HugeiconsIcon icon={PencilEdit02Icon} size={16} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setSessionToDelete(session.id)
              }}
              className="w-[36px] h-[44px] flex items-center justify-center hover:bg-white rounded hover:shadow-sm text-slate-400 hover:text-rose-600 transition-colors"
            >
              <HugeiconsIcon icon={Delete02Icon} size={16} />
            </button>
          </div>
        )}

        {/* Removed duplicate pin indicator */}
      </div>
    )
  }

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#f8f9ff]">
      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b border-slate-100">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Chat History</h3>
        <button
          onClick={onClose}
          className="w-[44px] h-[44px] flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 cursor-pointer"
        >
          <HugeiconsIcon icon={ArrowLeft02Icon} size={20} />
        </button>
      </div>

      {/* Action / New Chat button */}
      <div className="p-3">
        <button
          onClick={() => {
            onCreateSession()
            onClose()
          }}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-br from-[#0037b0] to-[#1d4ed8] hover:opacity-95 text-white font-semibold text-xs shadow-[0px_4px_16px_rgba(0,55,176,0.12)] hover:shadow-[0px_8px_24px_rgba(0,55,176,0.16)] transition-all min-h-[44px] cursor-pointer"
        >
          <HugeiconsIcon icon={PlusSignIcon} size={14} />
          New Thread
        </button>
      </div>

      {/* Search bar */}
      <div className="px-3 mb-2 relative">
        <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none">
          <HugeiconsIcon icon={Search01Icon} size={14} className="text-slate-400" />
        </div>
        <input
          type="text"
          placeholder="Search conversations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-[16px] sm:text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0037b0]/20 focus:border-[#0037b0]/40 transition-all min-h-[40px]"
        />
      </div>

      {/* Scrollable conversation list */}
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {pinnedSessions.length > 0 && (
          <div className="mb-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 mb-1.5 flex items-center gap-1">
              <HugeiconsIcon icon={Bookmark01Icon} size={12} /> Pinned
            </p>
            {pinnedSessions.map(renderSessionItem)}
          </div>
        )}

        <div>
          {todaySessions.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 mb-1.5">Today</p>
              {todaySessions.map(renderSessionItem)}
            </div>
          )}
          {yesterdaySessions.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 mb-1.5">Yesterday</p>
              {yesterdaySessions.map(renderSessionItem)}
            </div>
          )}
          {previous7DaysSessions.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 mb-1.5">Previous 7 Days</p>
              {previous7DaysSessions.map(renderSessionItem)}
            </div>
          )}
          {previous30DaysSessions.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 mb-1.5">Previous 30 Days</p>
              {previous30DaysSessions.map(renderSessionItem)}
            </div>
          )}
          {olderSessions.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 mb-1.5">Older</p>
              {olderSessions.map(renderSessionItem)}
            </div>
          )}

          {recentSessions.length === 0 && searchQuery && (
            <p className="text-xs text-slate-400 text-center py-4">No matching chats found.</p>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* Mobile Backdrop overlay */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-[4px] z-40 lg:hidden transition-all duration-300"
        />
      )}

      {/* Sidebar Sliding Panel */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 w-[270px] bg-[#f8f9ff] border-r border-slate-200 z-50 transition-all duration-300 transform lg:relative lg:translate-x-0 lg:z-0 lg:flex lg:flex-col lg:h-full lg:shrink-0',
          isOpen
            ? 'translate-x-0 lg:w-64 lg:opacity-100 lg:border-r'
            : '-translate-x-full lg:w-0 lg:opacity-0 lg:pointer-events-none lg:overflow-hidden lg:border-r-transparent'
        )}
      >
        {sidebarContent}
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!sessionToDelete}
        onClose={() => setSessionToDelete(null)}
        title="Delete Chat Thread"
        description="Are you sure you want to delete this conversation? This action cannot be undone."
      >
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={() => setSessionToDelete(null)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            className="bg-rose-600 hover:bg-rose-700 text-white"
            onClick={() => {
              if (sessionToDelete) {
                onDeleteSession(sessionToDelete)
                setSessionToDelete(null)
              }
            }}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </>
  )
}
