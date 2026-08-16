import { useEffect, useRef, useState } from 'react'
import BottomNav from '../components/layout/BottomNav'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'

const SUGGESTIONS = [
  { icon: '👋', text: 'מה שלומך?' },
  { icon: '🍝', text: 'תן לי מתכון לפסטה בולונז' },
  { icon: '📅', text: 'מה יש לנו השבוע ביומן?' },
  { icon: '🏖️', text: 'תכנן לי טיול לאילת' },
  { icon: '🛒', text: 'תוסיף חלב וביצים לקניות' },
  { icon: '✅', text: 'מה המשימות הפתוחות?' },
]

function TypingDots() {
  return (
    <div className="flex items-end gap-3 px-4 py-2" dir="rtl">
      <div className="w-9 h-9 rounded-full bg-white/20 border border-white/30 flex items-center justify-center text-base shrink-0 shadow">🤖</div>
      <div className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-2xl rounded-br-sm px-4 py-3">
        <div className="flex gap-1.5 items-center h-4">
          {[0,180,360].map(d => (
            <span key={d} className="w-2 h-2 rounded-full bg-white/60 animate-bounce" style={{ animationDelay:`${d}ms` }} />
          ))}
        </div>
      </div>
    </div>
  )
}

function ActionBadges({ actions }) {
  if (!actions?.length) return null
  const map = {
    web_search:               r => r?.results?.length > 0 ? `🔍 ${r.results.length} תוצאות` : null,
    add_shopping_items:       r => r?.added > 0 ? `🛒 ${r.added} נוספו לקניות` : null,
    delete_shopping_item:     r => r?.deleted > 0 ? `🗑️ נמחק` : null,
    toggle_shopping_done:     r => r?.updated > 0 ? `✔️ עודכן` : null,
    clear_completed_shopping: r => r?.deleted > 0 ? `🧹 נוקו ${r.deleted}` : null,
    create_event:             r => r?.created ? `📅 נוסף ליומן` : null,
    update_event:             r => r?.updated ? `✏️ יומן עודכן` : null,
    delete_event:             r => r?.deleted > 0 ? `🗑️ אירוע נמחק` : null,
    create_task:              r => r?.created ? `✅ משימה נוצרה` : null,
    complete_task:            r => r?.completed ? `🎉 הושלמה` : null,
    delete_task:              r => r?.deleted > 0 ? `🗑️ נמחקה` : null,
    update_task:              r => r?.updated ? `✏️ עודכנה` : null,
  }
  const badges = actions.map(a => map[a.tool]?.(a.result)).filter(Boolean)
  if (!badges.length) return null
  return (
    <div className="flex flex-wrap gap-1.5 mt-2 pr-11">
      {badges.map((b, i) => (
        <span key={i} className="text-xs bg-emerald-500/25 border border-emerald-300/30 text-emerald-100 rounded-full px-2.5 py-1">{b}</span>
      ))}
    </div>
  )
}

function Message({ msg }) {
  const isUser = msg.role === 'user'
  if (isUser) {
    return (
      <div className="flex justify-end px-4 py-1" dir="ltr">
        <div className="max-w-[80%] bg-white text-gray-900 rounded-2xl rounded-br-sm px-4 py-2.5 shadow-md">
          <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ direction: 'rtl', textAlign: 'right' }}>{msg.content}</p>
        </div>
      </div>
    )
  }
  return (
    <div className="px-4 py-1" dir="rtl">
      <div className="flex gap-2.5 items-start">
        <div className="w-9 h-9 rounded-full bg-white/20 border border-white/25 flex items-center justify-center text-base shrink-0 shadow">🤖</div>
        <div className="flex-1 min-w-0">
          <div className="bg-white/12 backdrop-blur-sm border border-white/15 rounded-2xl rounded-br-sm px-4 py-2.5 shadow-sm">
            <p className="text-sm text-white leading-relaxed whitespace-pre-wrap">{msg.content}</p>
          </div>
          <ActionBadges actions={msg.actions} />
        </div>
      </div>
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
    return [{ role: 'assistant', content: `שלום ${firstName} 👋\nאני כאן לעזור — קניות, יומן, משימות, מתכונים, שאלות — הכל.\n\nמה תרצה?` }]
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
      setMessages(prev => [...prev, { role: 'assistant', content: res.data.reply, actions: res.data.actions || [] }])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: err?.response?.data?.message || 'משהו השתבש, נסה שוב.', actions: [] }])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  const resetChat = () => {
    const fresh = [{ role: 'assistant', content: `שלום ${firstName} 👋\nאני כאן לעזור — קניות, יומן, משימות, מתכונים, שאלות — הכל.\n\nמה תרצה?` }]
    setMessages(fresh)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh)) } catch {}
  }

  const showSuggestions = messages.length === 1 && !loading

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(175deg,#0c1445 0%,#1a2f7a 35%,#1d4ed8 75%,#2563eb 100%)' }}>

      {/* Header */}
      <div className="fixed top-0 inset-x-0 z-30" style={{ background: 'rgba(12,20,69,0.85)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingTop: 'env(safe-area-inset-top,0px)' }}>
        <div className="h-14 max-w-2xl mx-auto px-4 flex items-center justify-between">
          <button onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-lg shadow-lg">🤖</div>
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-400 rounded-full ring-2 ring-[#0c1445]" />
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-none">עוזר המשפחה</p>
              <p className="text-blue-300 text-[11px] leading-none mt-0.5">פעיל · AI</p>
            </div>
          </div>
          <button onClick={resetChat}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            title="שיחה חדשה">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto max-w-2xl mx-auto w-full" style={{ paddingTop: '72px', paddingBottom: '130px' }}>

        {/* Avatar intro */}
        <div className="flex flex-col items-center pt-8 pb-6">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-400 to-indigo-700 flex items-center justify-center text-4xl shadow-2xl mb-3 ring-4 ring-white/10">🤖</div>
          <p className="text-white font-bold text-lg tracking-wide">עוזר המשפחה</p>
          <p className="text-blue-300 text-xs mt-1">מחובר לאינטרנט · שולט באפליקציה</p>
        </div>

        <div className="space-y-1 pb-2">
          {messages.map((msg, i) => <Message key={i} msg={msg} />)}
          {loading && <TypingDots />}

          {showSuggestions && (
            <div className="px-4 pt-3" dir="rtl">
              <p className="text-blue-300/80 text-xs mb-2.5">נסה לשאול:</p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map(s => (
                  <button key={s.text} onClick={() => send(s.text)}
                    className="flex items-center gap-1.5 text-xs bg-white/10 hover:bg-white/20 border border-white/15 rounded-full px-3 py-1.5 text-white transition-all active:scale-95">
                    <span>{s.icon}</span><span>{s.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div ref={bottomRef} />
      </main>

      {/* Input */}
      <div className="fixed bottom-16 inset-x-0 z-20" style={{ paddingBottom: 'env(safe-area-inset-bottom,0px)' }}>
        <div className="max-w-2xl mx-auto px-3 py-2.5">
          <div className="flex items-end gap-2 rounded-2xl px-3 py-2 shadow-2xl"
            style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.15)' }}
            dir="rtl">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              onInput={e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px' }}
              placeholder="שאל אותי משהו..."
              rows={1}
              disabled={loading}
              className="flex-1 resize-none bg-transparent text-sm text-white placeholder-white/40 focus:outline-none leading-relaxed max-h-28 overflow-y-auto py-1"
              style={{ direction: 'rtl' }}
            />
            <button onClick={() => send()} disabled={!input.trim() || loading}
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mb-0.5 transition-all disabled:opacity-25 active:scale-95"
              style={{ background: input.trim() && !loading ? 'linear-gradient(135deg,#3b82f6,#6366f1)' : 'rgba(255,255,255,0.15)' }}>
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
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
