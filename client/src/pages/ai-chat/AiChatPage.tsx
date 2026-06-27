import { useState, useRef, useEffect } from 'react'
import { Send } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { Header } from '@/components/layout'
import { aiApi, type ChatMessage } from '@/api/ai'
import { AiChatIcon } from '@/components/ui/CustomIcons'
import { useOverscrollBounce } from '@/hooks'
import { cn } from '@/lib/utils'

const SUGGESTED_QUESTIONS = [
  'How did my business perform this month?',
  'Which clients owe me the most money?',
  'What were my biggest expenses last quarter?',
  'Who are my top clients this year?',
]

function ThinkingBubble() {
  return (
    <div className="flex items-end gap-2">
      <div className="w-7 h-7 rounded-full bg-[#0037b0]/10 flex items-center justify-center shrink-0">
        <AiChatIcon className="text-[#0037b0] w-4 h-4" />
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
        <div className="flex gap-1.5 items-center h-4">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:150ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  return (
    <div className={cn('flex items-end gap-2', isUser && 'flex-row-reverse')}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-[#0037b0]/10 flex items-center justify-center shrink-0 mb-0.5">
          <AiChatIcon className="text-[#0037b0] w-4 h-4" />
        </div>
      )}
      <div
        className={cn(
          'max-w-[82%] px-4 py-3 text-sm shadow-sm',
          isUser
            ? 'bg-gradient-to-br from-[#0037b0] to-[#1d4ed8] text-white rounded-2xl rounded-br-sm leading-relaxed'
            : 'bg-white border border-slate-200 text-slate-800 rounded-2xl rounded-bl-sm',
        )}
      >
        {isUser ? (
          message.content
        ) : (
          <ReactMarkdown
            components={{
              p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
              strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
              h1: ({ children }) => <h1 className="text-base font-bold text-slate-900 mb-2 mt-1">{children}</h1>,
              h2: ({ children }) => <h2 className="text-sm font-bold text-slate-900 mb-2 mt-1">{children}</h2>,
              h3: ({ children }) => <h3 className="text-sm font-semibold text-slate-900 mb-1.5 mt-1">{children}</h3>,
              ul: ({ children }) => <ul className="list-disc list-inside space-y-1 mb-2 text-slate-700">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 mb-2 text-slate-700">{children}</ol>,
              li: ({ children }) => <li className="leading-relaxed">{children}</li>,
              hr: () => <hr className="border-slate-200 my-3" />,
              table: ({ children }) => (
                <div className="overflow-x-auto my-2 rounded-lg border border-slate-200">
                  <table className="w-full text-xs">{children}</table>
                </div>
              ),
              thead: ({ children }) => <thead className="bg-slate-50">{children}</thead>,
              th: ({ children }) => <th className="px-3 py-2 text-left font-semibold text-slate-600 border-b border-slate-200 whitespace-nowrap">{children}</th>,
              td: ({ children }) => <td className="px-3 py-2 text-slate-700 border-b border-slate-100 last:border-0">{children}</td>,
              tr: ({ children }) => <tr className="hover:bg-slate-50/50">{children}</tr>,
              code: ({ children }) => <code className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>,
            }}
          >
            {message.content}
          </ReactMarkdown>
        )}
      </div>
    </div>
  )
}

export function AiChatPage() {
  const scrollContainerRef = useOverscrollBounce<HTMLDivElement>()
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const send = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    const userMessage: ChatMessage = { role: 'user', content: trimmed }
    const next = [...messages, userMessage]
    setMessages(next)
    setInput('')
    setLoading(true)

    try {
      const { message } = await aiApi.chat(next)
      setMessages([...next, { role: 'assistant', content: message }])
    } catch {
      setMessages([...next, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  const isEmpty = messages.length === 0

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background">
      <Header
        title="AI Chat"
        description="Ask questions about your business data"
        icon={AiChatIcon}
        category="Analytics"
      />

      <div ref={scrollContainerRef} className="flex-1 overflow-auto px-4 pb-4 sm:px-8">
        <div className="max-w-2xl mx-auto pt-4 sm:pt-8 flex flex-col gap-4 min-h-full">

          {isEmpty ? (
            <div className="flex flex-col items-center justify-center flex-1 py-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-[#0037b0]/8 flex items-center justify-center mb-4">
                <AiChatIcon className="text-[#0037b0] w-8 h-8" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 mb-1">Ask about your business</h2>
              <p className="text-sm text-slate-500 mb-8 max-w-xs">
                I can look up your revenue, clients, expenses, and more in real time.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    className="text-left px-4 py-3 rounded-xl border border-border bg-white text-xs font-medium text-slate-700 hover:border-[#0037b0]/30 hover:text-[#0037b0] hover:bg-[#0037b0]/3 transition-all cursor-pointer shadow-sm"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {messages.map((m, i) => <MessageBubble key={i} message={m} />)}
              {loading && <ThinkingBubble />}
              <div ref={bottomRef} />
            </div>
          )}

        </div>
      </div>

      {/* Input bar */}
      <div className="border-t border-border bg-background px-4 py-3 sm:px-8">
        <div className="max-w-2xl mx-auto flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about your business..."
            rows={1}
            disabled={loading}
            className="flex-1 resize-none rounded-xl border border-border bg-white px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0037b0]/20 focus:border-[#0037b0]/40 disabled:opacity-50 min-h-[46px] max-h-32"
            style={{ overflowY: input.split('\n').length > 3 ? 'auto' : 'hidden' }}
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || loading}
            className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#0037b0] to-[#1d4ed8] text-white flex items-center justify-center shrink-0 hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="max-w-2xl mx-auto text-[10px] text-slate-400 mt-2 text-center">
          Press Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}
