import { useEffect, useRef, useState } from 'react'
import BottomNav from '../components/layout/BottomNav'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'

const SUGGESTIONS = [
  'מה שלומך?',
  'תן לי מתכון לפסטה בולונז',
  'מה יש לנו השבוע ביומן?',
  'תוסיף חלב וביצים לקניות',
  'תכנן לי טיול לאילת',
  'מה המשימות הפתוחות?',
]

function TypingIndicator() {
  return (
    <div className="flex gap-3 px-4 py-2">
      <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-sm shrink-0 mt-0.5">🤖</div>
      <div className="flex items-center gap-1 h-7">
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600 animate-bounce"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
    </div>
  )
}

function ActionBadges({ actions }) {
  if (!actions?.length) return null
  const map = {
    web_search:               (r) => r?.results?.length > 0 ? `🔍 ${r.results.length} תוצאות מהאינטרנט` : null,
    add_shopping_items:       (r) => r?.added > 0 ? `🛒 ${r.added} פריטים נוספו לקניות` : null,
    delete_shopping_item:     (r) => r?.deleted > 0 ? `🗑️ נמחק מהקניות` : null,
    toggle_shopping_done:     (r) => r?.updated > 0 ? `✔️ עודכן ברשימה` : null,
    clear_completed_shopping: (r) => r?.deleted > 0 ? `🧹 נוקה ${r.deleted} פריטים` : null,
    create_event:             (r) => r?.created ? `📅 נוסף ליומן` : null,
    update_event:             (r) => r?.updated ? `✏️ יומן עודכן` : null,
    delete_event:             (r) => r?.deleted > 0 ? `🗑️ אירוע נמחק` : null,
    create_task:              (r) => r?.created ? `✅ משימה נוצרה` : null,
    complete_task:            (r) => r?.completed ? `🎉 משימה הושלמה` : null,
    delete_task:              (r) => r?.deleted > 0 ? `🗑️ משימה נמחקה` : null,
    update_task:              (r) => r?.updated ? `✏️ משימה עודכנה` : null,
  }
  const badges = actions
    .map((a) => map[a.tool]?.(a.result))
    .filter(Boolean)
  if (!badges.length) return null
  return (
    <div className="flex flex-wrap gap-1.5 mt-2 pr-10">
      {badges.map((b, i) => (
        <span key={i} className="text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 border border-blue-100 dark:border-blue-800 rounded-full px-3 py-1">
          {b}
        </span>
      ))}
    </div>
  )
}

function Message({ msg }) {
  const isUser = msg.role === 'user'
  if (isUser) {
    return (
      <div className="flex justify-start px-4 py-1.5">
        <div className="max-w-[75%] bg-blue-600 text-white rounded-2xl rounded-br-md px-4 py-2.5">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
        </div>
      </div>
    )
  }
  return (
    <div className="px-4 py-1.5">
      <div className="flex gap-3">
        <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-sm shrink-0 mt-0.5">🤖</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-800 dark:text-gray-100 leading-relaxed whitespace-pre-wrap">{msg.content}</p>
        </div>
      </div>
      <ActionBadges actions={msg.actions} />
    </div>
  )
}

export default function AiAssistant() {
  const { user }  = useAuth()
  const navigate  = useNavigate()
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)
  const firstName = (user?.name || '').split(' ')[0]

  const STORAGE_KEY = `ai_chat_${user?.family_id || 'default'}`

  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) return JSON.parse(saved)
    } catch {}
    return [{
      role: 'assistant',
      content: `שלום ${firstName} 👋\nאני כאן לעזור — קניות, יומן, משימות, שאלות, מתכונים, עצות — הכל.\n\nמה תרצה לעשות?`,
    }]
  })
  const [input,   setInput]   = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-50))) } catch {}
  }, [messages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send(text) {
    const msg = (text ?? input).trim()
    if (!msg || loading) return
    setInput('')
    if (inputRef.current) inputRef.current.style.height = 'auto'

    setMessages(prev => [...prev, { role: 'user', content: msg }])
    setLoading(true)

    const history = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content }))

    try {
      const res = await api.post('/api/ai/chat', { message: msg, history })
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: res.data.reply,
        actions: res.data.actions || [],
      }])
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: err?.response?.data?.message || 'משהו השתבש, נסה שוב.',
        actions: [],
      }])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  const showSuggestions = messages.length === 1 && !loading

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-gray-950">

      {/* Header */}
      <div
        className="fixed top-0 inset-x-0 z-30 bg-white dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="h-14 max-w-2xl mx-auto px-4 flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>

          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-sm">🤖</div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white leading-none">עוזר המשפחה</p>
              <p className="text-[10px] text-green-500 leading-none mt-0.5">פעיל</p>
            </div>
          </div>

          <button
            onClick={() => {
              const fresh = [{ role: 'assistant', content: `שלום ${firstName} 👋\nאני כאן לעזור — קניות, יומן, משימות, שאלות, מתכונים, עצות — הכל.\n\nמה תרצה לעשות?` }]
              setMessages(fresh)
              try { localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh)) } catch {}
            }}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="שיחה חדשה"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages */}
      <main
        className="flex-1 overflow-y-auto max-w-2xl mx-auto w-full"
        style={{ paddingTop: '70px', paddingBottom: '130px' }}
      >
        <div dir="rtl" className="py-4 space-y-1">
          {messages.map((msg, i) => <Message key={i} msg={msg} />)}
          {loading && <TypingIndicator />}

          {/* Suggestion chips */}
          {showSuggestions && (
            <div className="px-4 pt-4">
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">נסה לשאול:</p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-xs border border-gray-200 dark:border-gray-700 rounded-full px-3 py-1.5 text-gray-600 dark:text-gray-300 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors bg-white dark:bg-gray-900"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div ref={bottomRef} />
      </main>

      {/* Input */}
      <div
        className="fixed bottom-16 inset-x-0 z-20 bg-white dark:bg-gray-950 border-t border-gray-100 dark:border-gray-800"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="max-w-2xl mx-auto px-3 py-2.5" dir="rtl">
          <div className="flex items-end gap-2 border border-gray-200 dark:border-gray-700 rounded-2xl px-3 py-2 bg-gray-50 dark:bg-gray-900 focus-within:border-blue-400 dark:focus-within:border-blue-500 transition-colors">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
              }}
              onInput={e => {
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
              }}
              placeholder="שאל אותי משהו..."
              rows={1}
              disabled={loading}
              className="flex-1 resize-none bg-transparent text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none leading-relaxed max-h-28 overflow-y-auto py-1"
              style={{ direction: 'rtl' }}
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              className="w-8 h-8 rounded-xl bg-blue-600 disabled:bg-gray-200 dark:disabled:bg-gray-700 flex items-center justify-center shrink-0 transition-colors mb-0.5"
            >
              <svg className="w-4 h-4 text-white dark:text-gray-400 disabled:text-gray-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  )
}
