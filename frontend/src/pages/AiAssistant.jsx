import { useEffect, useRef, useState } from 'react'
import BottomNav from '../components/layout/BottomNav'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useNavigate } from 'react-router-dom'

const SUGGESTIONS = [
  { text: 'מה שלומך?',                       icon: '👋' },
  { text: 'תן לי מתכון לפסטה בולונז',        icon: '🍝' },
  { text: 'מה יש לנו השבוע ביומן?',          icon: '📅' },
  { text: 'אני רוצה לתכנן טיול לאילת',       icon: '🏖️' },
  { text: 'תוסיף חלב וביצים ולחם לקניות',   icon: '🛒' },
  { text: 'תצור משימה לנקות את הסלון',       icon: '🧹' },
]

function TypingDots() {
  return (
    <div className="flex items-end gap-2 mb-3">
      <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-base shrink-0 shadow border border-white/30">🤖</div>
      <div className="bg-white dark:bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-3 shadow-md">
        <div className="flex gap-1.5 items-center h-4">
          {[0, 150, 300].map(d => (
            <span key={d} className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />
          ))}
        </div>
      </div>
    </div>
  )
}

function ActionBadges({ actions }) {
  if (!actions?.length) return null
  const badges = actions.map((a, i) => {
    const { tool, result } = a
    if (result?.error) return null
    const map = {
      add_shopping_items:    result?.added > 0 ? `🛒 ${result.added} פריטים נוספו` : null,
      delete_shopping_item:  result?.deleted > 0 ? `🗑️ נמחק מהקניות` : null,
      toggle_shopping_done:  result?.updated > 0 ? `✔️ עודכן ברשימה` : null,
      clear_completed_shopping: result?.deleted > 0 ? `🧹 נוקה (${result.deleted})` : null,
      create_event:          result?.created ? `📅 נוסף ליומן` : null,
      update_event:          result?.updated ? `✏️ יומן עודכן` : null,
      delete_event:          result?.deleted > 0 ? `🗑️ אירוע נמחק` : null,
      create_task:           result?.created ? `✅ משימה נוצרה` : null,
      complete_task:         result?.completed ? `🎉 משימה הושלמה` : null,
      delete_task:           result?.deleted > 0 ? `🗑️ משימה נמחקה` : null,
      update_task:           result?.updated ? `✏️ משימה עודכנה` : null,
    }
    const label = map[tool]
    if (!label) return null
    const colors = {
      '🛒': 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-700',
      '📅': 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700',
      '✅': 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-700',
      '🎉': 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-700',
    }
    const col = colors[label[0]] || 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600'
    return <span key={i} className={`inline-flex items-center gap-1 text-xs rounded-full px-2.5 py-1 border ${col}`}>{label}</span>
  }).filter(Boolean)

  if (!badges.length) return null
  return <div className="mt-2 flex flex-wrap gap-1.5">{badges}</div>
}

function Message({ msg }) {
  const isUser = msg.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-start mb-3">
        <div className="max-w-[78%] bg-blue-600 text-white rounded-2xl rounded-br-sm px-4 py-2.5 shadow-md">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-end gap-2 mb-3">
      <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-base shrink-0 shadow border border-white/20">🤖</div>
      <div className="max-w-[78%]">
        <div className="bg-white dark:bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-2.5 shadow-md border border-gray-100 dark:border-gray-700">
          <p className="text-sm text-gray-800 dark:text-gray-100 leading-relaxed whitespace-pre-wrap">{msg.content}</p>
        </div>
        <ActionBadges actions={msg.actions} />
      </div>
    </div>
  )
}

export default function AiAssistant() {
  const { user }         = useAuth()
  const { dark }         = useTheme()
  const navigate         = useNavigate()
  const bottomRef        = useRef(null)
  const inputRef         = useRef(null)
  const firstName        = (user?.name || '').split(' ')[0]

  const [messages, setMessages] = useState([
    {
      role:    'assistant',
      content: `שלום ${firstName} 👋\nאני עוזר המשפחה שלך — כתוב לי בעברית רגילה ואעזור לך:\n🛒 להוסיף לקניות\n📅 לנהל את היומן\n✅ ליצור משימות`,
    }
  ])
  const [input,   setInput]   = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send(text) {
    const msg = (text ?? input).trim()
    if (!msg || loading) return
    setInput('')
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
    }

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
        role:    'assistant',
        content: res.data.reply,
        actions: res.data.actions || [],
      }])
    } catch (err) {
      const serverMsg = err?.response?.data?.message
      setMessages(prev => [...prev, {
        role:    'assistant',
        content: serverMsg || 'אופס, משהו לא עבד. נסה שוב 🙏',
        actions: [],
      }])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const showSuggestions = messages.length === 1 && !loading

  return (
    <div className="min-h-screen flex flex-col" style={{ background: dark ? '#111827' : 'linear-gradient(160deg, #1d4ed8 0%, #3b82f6 35%, #e0f2fe 100%)' }}>

      {/* Custom header */}
      <div
        className="fixed top-0 inset-x-0 z-30"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="h-16 max-w-lg mx-auto px-4 flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
          >
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <div className="text-center">
            <p className="text-white font-bold text-base leading-tight">עוזר המשפחה</p>
            <p className="text-blue-200 text-xs">מחובר · עונה בעברית</p>
          </div>
          <div className="w-9" />
        </div>
      </div>

      {/* Chat area */}
      <main
        className="flex-1 overflow-y-auto px-4 max-w-lg mx-auto w-full"
        style={{ paddingTop: '80px', paddingBottom: '136px' }}
      >
        {/* Avatar */}
        <div className="flex flex-col items-center py-8">
          <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm border-2 border-white/40 flex items-center justify-center text-4xl shadow-xl mb-3">
            🤖
          </div>
          <p className="text-white font-bold text-lg">עוזר המשפחה</p>
          <p className="text-blue-200 text-xs mt-0.5">מופעל על ידי AI · Groq llama 70b</p>
        </div>

        {/* Messages */}
        <div dir="rtl">
          {messages.map((msg, i) => <Message key={i} msg={msg} />)}
          {loading && <TypingDots />}
        </div>

        {/* Suggestions */}
        {showSuggestions && (
          <div className="mt-4" dir="rtl">
            <p className="text-blue-200 text-xs mb-2 pr-1">נסה לשאול:</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map(s => (
                <button
                  key={s.text}
                  onClick={() => send(s.text)}
                  className="flex items-center gap-1.5 text-xs bg-white/15 hover:bg-white/25 backdrop-blur-sm border border-white/30 rounded-full px-3 py-1.5 text-white transition-colors shadow-sm"
                >
                  <span>{s.icon}</span>
                  <span>{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </main>

      {/* Input bar */}
      <div
        className="fixed bottom-16 inset-x-0 z-20"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="max-w-lg mx-auto px-3 py-2.5">
          <div className="flex items-end gap-2 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 px-3 py-2" dir="rtl">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="כתוב לי משהו..."
              rows={1}
              disabled={loading}
              className="flex-1 resize-none bg-transparent text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none leading-relaxed max-h-28 overflow-y-auto py-1"
              style={{ direction: 'rtl' }}
              onInput={e => {
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 112) + 'px'
              }}
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shrink-0 transition-all disabled:opacity-30 active:scale-95 hover:bg-blue-700 shadow-md mb-0.5"
              aria-label="שלח"
            >
              <svg className="w-4 h-4 text-white rotate-180" fill="currentColor" viewBox="0 0 24 24">
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
