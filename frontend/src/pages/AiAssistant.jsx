import { useEffect, useRef, useState } from 'react'
import Header from '../components/layout/Header'
import BottomNav from '../components/layout/BottomNav'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'

const SUGGESTIONS = [
  'תוסיף חלב וביצים לקניות',
  'מה יש לנו השבוע ביומן?',
  'תצור משימה לנקות את הסלון',
  'צריך חומרים לפיצה',
  'מה המשימות הפתוחות?',
  'תוסיף ביקור אצל הרופא ביומן',
]

function TypingDots() {
  return (
    <div className="flex items-end gap-2 mb-4">
      <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-base shrink-0 shadow-sm">🤖</div>
      <div className="bg-white dark:bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex gap-1 items-center h-4">
          <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  )
}

function ActionBadge({ action }) {
  const { tool, result } = action
  if (result?.error) return null

  if (tool === 'add_shopping_items' && result?.added > 0) {
    return (
      <div className="mt-1.5 inline-flex items-center gap-1.5 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-full px-3 py-1 text-xs text-green-700 dark:text-green-300">
        🛒 הוספתי {result.added} פריטים לקניות
      </div>
    )
  }
  if (tool === 'create_event' && result?.created) {
    return (
      <div className="mt-1.5 inline-flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-full px-3 py-1 text-xs text-blue-700 dark:text-blue-300">
        📅 נוסף ליומן: {result.title}
      </div>
    )
  }
  if (tool === 'create_task' && result?.created) {
    return (
      <div className="mt-1.5 inline-flex items-center gap-1.5 bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-full px-3 py-1 text-xs text-purple-700 dark:text-purple-300">
        ✅ נוצרה משימה: {result.title}
      </div>
    )
  }
  return null
}

function Message({ msg }) {
  const isUser = msg.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-start mb-4">
        <div className="max-w-[80%] bg-blue-600 text-white rounded-2xl rounded-br-sm px-4 py-2.5 shadow-sm">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-end gap-2 mb-4">
      <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-base shrink-0 shadow-sm">🤖</div>
      <div className="max-w-[80%]">
        <div className="bg-white dark:bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-2.5 shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-sm text-gray-800 dark:text-gray-100 leading-relaxed whitespace-pre-wrap">{msg.content}</p>
        </div>
        {msg.actions?.map((a, i) => <ActionBadge key={i} action={a} />)}
      </div>
    </div>
  )
}

export default function AiAssistant() {
  const { user } = useAuth()
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `שלום ${(user?.name || '').split(' ')[0]} 👋\nאני עוזר המשפחה שלך! אני יכול לעזור לך:\n• להוסיף פריטים לקניות\n• לראות ולהוסיף אירועים ביומן\n• לנהל משימות בבית\n\nמה תרצה לעשות?`,
    }
  ])
  const [input,   setInput]   = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send(text) {
    const msg = (text || input).trim()
    if (!msg || loading) return
    setInput('')

    const userMsg = { role: 'user', content: msg }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    const historyForApi = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content }))

    try {
      const res = await api.post('/api/ai/chat', {
        message: msg,
        history: historyForApi,
      })
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: res.data.reply,
        actions: res.data.actions || [],
      }])
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'אופס, משהו השתבש. נסה שוב 🙏',
        actions: [],
      }])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const showSuggestions = messages.length === 1

  return (
    <div className="min-h-screen bg-[#f0f4f8] dark:bg-gray-900 flex flex-col">
      <Header />

      {/* Chat area */}
      <main
        className="flex-1 overflow-y-auto px-4 max-w-lg mx-auto w-full"
        style={{ paddingTop: '80px', paddingBottom: '140px' }}
      >
        {/* AI header card */}
        <div className="flex flex-col items-center py-6 mb-2">
          <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-3xl shadow-lg mb-2">🤖</div>
          <h2 className="text-base font-bold text-gray-800 dark:text-white">עוזר המשפחה</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500">מופעל על ידי AI · עונה בעברית</p>
        </div>

        {/* Messages */}
        <div dir="rtl">
          {messages.map((msg, i) => <Message key={i} msg={msg} />)}
          {loading && <TypingDots />}
        </div>

        {/* Quick suggestions */}
        {showSuggestions && !loading && (
          <div className="mt-2" dir="rtl">
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-2 pr-1">נסה לכתוב:</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full px-3 py-1.5 text-gray-600 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 hover:text-blue-600 transition-colors shadow-sm"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </main>

      {/* Input bar */}
      <div
        className="fixed bottom-16 inset-x-0 z-20 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="max-w-lg mx-auto px-3 py-2 flex items-end gap-2" dir="rtl">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="כתוב לי משהו..."
            rows={1}
            disabled={loading}
            className="flex-1 resize-none bg-gray-100 dark:bg-gray-800 rounded-2xl px-4 py-2.5 text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed max-h-28 overflow-y-auto"
            style={{ direction: 'rtl' }}
            onInput={e => {
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 112) + 'px'
            }}
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || loading}
            className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center shrink-0 transition-all disabled:opacity-40 disabled:scale-95 active:scale-95 hover:bg-blue-700 shadow-md"
            aria-label="שלח"
          >
            <svg className="w-5 h-5 text-white rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>

      <BottomNav />
    </div>
  )
}
