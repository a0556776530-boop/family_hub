import { useEffect, useRef, useState, useCallback } from 'react'
import BottomNav from '../components/layout/BottomNav'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000'


// ─── Time-aware suggestions ────────────────────────────────────────────────────
function getSuggestions() {
  const h = new Date().getHours()
  if (h >= 6 && h < 11) return [
    { icon: '🌅', text: 'מה יש לנו היום?' },
    { icon: '🥐', text: 'תן לי רעיון לארוחת בוקר' },
    { icon: '📋', text: 'מה המשימות הפתוחות?' },
    { icon: '🛒', text: 'מה יש בקניות?' },
  ]
  if (h >= 11 && h < 14) return [
    { icon: '🍽️', text: 'מה לאכול היום בצהריים?' },
    { icon: '🍝', text: 'תן לי מתכון לפסטה מהירה' },
    { icon: '📅', text: 'מה יש לנו השבוע?' },
    { icon: '🛒', text: 'תוסיף חלב וביצים לקניות' },
  ]
  return [
    { icon: '🍝', text: 'תן לי מתכון לפסטה בולונז' },
    { icon: '📅', text: 'מה יש לנו השבוע ביומן?' },
    { icon: '🌍', text: 'תכנן לי טיול לאילת' },
    { icon: '🛒', text: 'תוסיף חלב וביצים לקניות' },
    { icon: '✅', text: 'מה המשימות הפתוחות?' },
    { icon: '🍕', text: 'מה אפשר לאכול מ-5 מרכיבים?' },
  ]
}

// ─── Markdown parser ───────────────────────────────────────────────────────────
function parseInline(text) {
  if (!text) return []
  const re = /(\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|`[^`]+`)/g
  return text.split(re).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4)
      return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>
    const lm = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/)
    if (lm)
      return <a key={i} href={lm[2]} target="_blank" rel="noopener noreferrer"
                className="text-blue-300 underline decoration-blue-400/40 hover:text-blue-100 break-all">{lm[1]} ↗</a>
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2)
      return <code key={i} className="bg-white/15 rounded px-1 text-xs font-mono text-blue-100">{part.slice(1, -1)}</code>
    return part
  })
}

function MarkdownText({ text, className = '' }) {
  if (!text) return null
  return (
    <div className={`space-y-0.5 text-sm text-white/95 leading-relaxed ${className}`}>
      {text.split('\n').map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1.5" />
        if (line.startsWith('### ')) return <h3 key={i} className="font-semibold text-blue-100 mt-2">{parseInline(line.slice(4))}</h3>
        if (line.startsWith('## '))  return <h2 key={i} className="font-bold text-base text-white mt-3 mb-0.5">{parseInline(line.slice(3))}</h2>
        if (line.startsWith('# '))   return <h1 key={i} className="font-bold text-lg text-white mt-3 mb-1">{parseInline(line.slice(2))}</h1>
        if (/^[-•*]\s/.test(line))
          return (
            <div key={i} className="flex gap-2 items-start">
              <span className="text-blue-300/80 shrink-0 mt-px font-bold leading-5">•</span>
              <span className="flex-1">{parseInline(line.replace(/^[-•*]\s+/, ''))}</span>
            </div>
          )
        const nm = line.match(/^(\d+)\.\s+(.+)$/)
        if (nm)
          return (
            <div key={i} className="flex gap-2 items-start">
              <span className="text-blue-300/80 font-bold shrink-0 min-w-[1.25rem] text-right leading-5">{nm[1]}.</span>
              <span className="flex-1">{parseInline(nm[2])}</span>
            </div>
          )
        return <p key={i}>{parseInline(line)}</p>
      })}
    </div>
  )
}

// ─── UI Components ─────────────────────────────────────────────────────────────

function SourceCard({ source }) {
  const domain = (() => { try { return new URL(source.url).hostname.replace('www.', '') } catch { return '' } })()
  return (
    <a href={source.url} target="_blank" rel="noopener noreferrer"
       className="flex flex-col gap-1 p-2.5 rounded-xl bg-white/6 border border-white/10 hover:bg-white/12 hover:border-white/18 transition-all group active:scale-[0.98]">
      <div className="flex items-start gap-2">
        <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`}
             className="w-4 h-4 rounded shrink-0 mt-0.5 opacity-75"
             onError={e => { e.target.style.display = 'none' }} alt="" />
        <p className="text-white text-[11.5px] font-medium leading-snug line-clamp-2 flex-1">{source.title}</p>
      </div>
      {source.content && <p className="text-blue-300/70 text-[10.5px] leading-snug line-clamp-2 pr-6">{source.content}</p>}
      <p className="text-blue-400/50 text-[10px] pr-6 group-hover:text-blue-300/60 transition-colors">{domain} ↗</p>
    </a>
  )
}

function ImageGrid({ images }) {
  if (!images?.length) return null
  return (
    <div className={`grid gap-1.5 mt-2 ${images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
      {images.slice(0, 4).map((img, i) => (
        <a key={i} href={img} target="_blank" rel="noopener noreferrer"
           className="rounded-xl overflow-hidden aspect-video bg-white/5 block">
          <img src={img} alt="" className="w-full h-full object-cover hover:opacity-90 transition-opacity"
               onError={e => { e.target.parentElement.style.display = 'none' }} />
        </a>
      ))}
    </div>
  )
}

function generateQuickActions(content, sources) {
  const acts = []
  if (/(?:מצרכים|מרכיבים|כפית|כפות|כוס|גרם|מ"ל|ק"ג|ליטר|קמח|שמן|מלח|סוכר)/.test(content))
    acts.push({ label: '🛒 הוסף מצרכים לקניות', message: 'תוסיף את המצרכים של המתכון הזה לרשימת הקניות' })
  if (sources.length > 0 && acts.length === 0)
    acts.push({ label: '🔍 מצא עוד מידע', message: 'תמצא לי עוד מידע על הנושא הזה' })
  if (/(?:הכנה|הוראות|שלב\s+\d|שוטפים|מחממים|מערבבים|מבשלים)/.test(content))
    acts.push({ label: '📤 שתף עם המשפחה', message: '' })
  return acts.slice(0, 3)
}

function QuickActions({ actions, onAction }) {
  if (!actions?.length) return null
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {actions.map((a, i) => (
        <button key={i} onClick={() => a.message && onAction(a.message)} disabled={!a.message}
                className="flex items-center gap-1.5 text-xs bg-blue-500/20 hover:bg-blue-500/35 border border-blue-400/25 hover:border-blue-400/40 rounded-full px-3.5 py-1.5 text-white transition-all active:scale-95 disabled:opacity-50">
          {a.label}
        </button>
      ))}
    </div>
  )
}

function ActionCard({ action, onUndo }) {
  const [countdown, setCountdown] = useState(8)
  const [undone,    setUndone]    = useState(false)

  useEffect(() => {
    if (countdown <= 0 || undone) return
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown, undone])

  const toolIcons  = { add_shopping_items: '🛒', create_task: '✅', create_event: '📅', delete_task: '🗑️', complete_task: '🎉', delete_event: '🗑️' }
  const toolLabels = {
    add_shopping_items: r => {
      const parts = []
      if (r.items?.length)   parts.push(`נוסף: ${r.items.join(', ')}`)
      if (r.skipped?.length) parts.push(`כבר ברשימה: ${r.skipped.join(', ')}`)
      return parts.join(' · ') || 'נוסף לקניות'
    },
    create_task:   r => `משימה נוצרה: ${r.title || ''}`,
    create_event:  r => `אירוע נוצר: ${r.title || ''}`,
    delete_task:   r => `משימה "${r.title || r.search || ''}" נמחקה`,
    complete_task: r => `משימה "${r.title || ''}" הושלמה`,
    delete_event:  () => 'אירוע נמחק',
  }

  if (undone) return (
    <div className="mt-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10">
      <span className="text-xs text-white/40">↩ הפעולה בוטלה</span>
    </div>
  )

  const label = toolLabels[action.tool]?.(action.result) || action.tool
  const icon  = toolIcons[action.tool] || '⚙️'

  return (
    <div className="mt-2 flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-400/25">
      <span className="text-sm text-emerald-200 leading-snug">{icon} {label}</span>
      {onUndo && countdown > 0 && (
        <button onClick={() => { setUndone(true); onUndo(action) }}
                className="text-xs text-blue-300/80 hover:text-blue-200 underline shrink-0 transition-colors">
          בטל ({countdown}s)
        </button>
      )}
    </div>
  )
}

function ToolBadges({ actions }) {
  if (!actions?.length) return null
  const map = {
    web_search:               r => r?.results?.length > 0 ? `🔍 ${r.results.length} מקורות` : null,
    toggle_shopping_done:     r => r?.updated > 0 ? `✔️ עודכן` : null,
    clear_completed_shopping: r => r?.deleted > 0 ? `🧹 ${r.deleted} נוקו` : null,
    update_event:             r => r?.updated ? `✏️ יומן עודכן` : null,
    update_task:              r => r?.updated ? `✏️ משימה עודכנה` : null,
  }
  const badges = actions.map(a => map[a.tool]?.(a.result)).filter(Boolean)
  if (!badges.length) return null
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {badges.map((b, i) => (
        <span key={i} className="text-[10.5px] bg-emerald-500/20 border border-emerald-400/25 text-emerald-200 rounded-full px-2.5 py-0.5">{b}</span>
      ))}
    </div>
  )
}

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch {}
  }
  return (
    <button onClick={copy} title="העתק"
            className="w-7 h-7 rounded-lg bg-white/8 hover:bg-white/15 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100">
      {copied
        ? <svg className="w-3.5 h-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
        : <svg className="w-3.5 h-3.5 text-blue-300/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
      }
    </button>
  )
}

function FeedbackBtns({ messageId, conversationId }) {
  const [voted, setVoted] = useState(null)
  const vote = async (rating) => {
    setVoted(rating)
    try { await api.post('/api/ai/feedback', { message_id: messageId, rating, conversation_id: conversationId }) } catch {}
  }
  if (voted !== null)
    return <span className="text-xs text-white/25">{voted === 1 ? '👍' : '👎'} תודה</span>
  return (
    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <button onClick={() => vote(1)}  className="text-sm hover:scale-125 transition-transform leading-none">👍</button>
      <button onClick={() => vote(-1)} className="text-sm hover:scale-125 transition-transform leading-none">👎</button>
    </div>
  )
}

function VoiceBtn({ onResult, disabled }) {
  const [listening, setListening] = useState(false)
  const recRef = useRef(null)

  const toggle = () => {
    if (listening) { recRef.current?.stop(); return }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    const r = new SR()
    r.lang           = 'he-IL'
    r.interimResults = false
    r.continuous     = false
    r.onresult       = e => { onResult(e.results[0][0].transcript) }
    r.onend          = () => setListening(false)
    r.onerror        = () => setListening(false)
    recRef.current   = r
    r.start()
    setListening(true)
    try { navigator.vibrate?.([30]) } catch {}
  }

  const SR_AVAILABLE = !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  if (!SR_AVAILABLE) return null

  return (
    <button onClick={toggle} disabled={disabled} title={listening ? 'עצור האזנה' : 'דבר עם העוזר'}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all shrink-0 mb-0.5 ${
              listening ? 'bg-red-500 animate-pulse shadow-lg shadow-red-500/40' : 'bg-white/10 hover:bg-white/18 disabled:opacity-30'
            }`}>
      {listening
        ? <span className="text-white text-xs font-bold">■</span>
        : <svg className="w-4 h-4 text-white/70" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 15c1.66 0 3-1.34 3-3V6c0-1.66-1.34-3-3-3S9 4.34 9 6v6c0 1.66 1.34 3 3 3zm-1 1.93V19H9v2h6v-2h-2v-2.07A7 7 0 0019 12h-2a5 5 0 01-10 0H5a7 7 0 006 6.93z"/>
          </svg>
      }
    </button>
  )
}

function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative rounded-2xl p-6 max-w-sm w-full shadow-2xl"
           style={{ background: 'linear-gradient(135deg,#0f1e5a 0%,#1a2f7a 100%)', border: '1px solid rgba(255,255,255,0.15)' }}>
        <div className="text-3xl text-center mb-3">⚠️</div>
        <p className="text-white font-bold text-base text-center mb-2">אישור נדרש</p>
        <p className="text-blue-200/90 text-sm text-center leading-relaxed mb-6">
          {message}<br />
          <span className="text-blue-300/60 text-xs">פעולה זו לא ניתנת לביטול</span>
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/18 text-white text-sm font-medium transition-colors">ביטול</button>
          <button onClick={onConfirm} className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-400 text-white text-sm font-bold transition-colors">כן, בצע</button>
        </div>
      </div>
    </div>
  )
}

function Message({ msg, onQuickAction, onRetry, onUndo, conversationId }) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end px-4 py-1" dir="ltr">
        <div className="max-w-[82%] bg-white text-gray-900 rounded-2xl rounded-br-sm px-4 py-2.5 shadow-md">
          <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ direction: 'rtl', textAlign: 'right' }}>{msg.content}</p>
          {msg.timestamp && (
            <time className="block text-right text-[9px] text-gray-400/60 mt-1">
              {new Date(msg.timestamp).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
            </time>
          )}
        </div>
      </div>
    )
  }

  const actionTools  = ['add_shopping_items', 'create_task', 'create_event', 'delete_task', 'complete_task', 'delete_event']
  const actionCards  = (msg.actions || []).filter(a => actionTools.includes(a.tool))
  const badgeActions = (msg.actions || []).filter(a => !actionTools.includes(a.tool))

  return (
    <div className="px-4 py-1.5 group" dir="rtl">
      <div className="flex gap-2.5 items-start">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400/60 to-indigo-600/60 border border-white/20 flex items-center justify-center text-[17px] shrink-0 shadow mt-0.5">🤖</div>
        <div className="flex-1 min-w-0">

          {msg.status && (
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-blue-200/80 bg-white/6 border border-white/10 rounded-full px-3 py-1 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse shrink-0" />
                {msg.status}
              </span>
            </div>
          )}

          {(msg.content || msg.streaming) && (
            <div className="bg-white/10 backdrop-blur-sm border border-white/14 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm relative">
              {msg.content ? (
                <>
                  <MarkdownText text={msg.content} />
                  {msg.streaming && (
                    <span className="inline-block w-0.5 h-[1em] bg-blue-300 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
                  )}
                </>
              ) : msg.streaming ? (
                <div className="flex gap-1.5 items-center h-5">
                  {[0, 160, 320].map(d => (
                    <span key={d} className="w-2 h-2 rounded-full bg-white/50 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                  ))}
                </div>
              ) : null}

              {!msg.streaming && msg.content && (
                <div className="absolute top-2 left-2"><CopyBtn text={msg.content} /></div>
              )}
            </div>
          )}

          {msg.error && onRetry && (
            <button onClick={onRetry} className="mt-2 text-xs text-blue-300/70 hover:text-blue-200 underline flex items-center gap-1 transition-colors">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              נסה שוב
            </button>
          )}

          {!msg.streaming && actionCards.map((a, i) => (
            <ActionCard key={i} action={a} onUndo={onUndo} />
          ))}

          {!msg.streaming && msg.sources?.length > 0 && (
            <div className="mt-2.5">
              <p className="text-blue-300/50 text-[10px] mb-1.5 font-medium tracking-wider uppercase">מקורות</p>
              <div className="grid gap-1.5">
                {msg.sources.slice(0, 4).map((s, i) => <SourceCard key={i} source={s} />)}
              </div>
            </div>
          )}

          {!msg.streaming && <ImageGrid images={msg.images} />}
          {!msg.streaming && <ToolBadges actions={badgeActions} />}

          {!msg.streaming && msg.quickActions?.length > 0 && (
            <QuickActions actions={msg.quickActions} onAction={onQuickAction} />
          )}

          {!msg.streaming && msg.content && (
            <div className="flex items-center justify-between mt-2 gap-2">
              <FeedbackBtns messageId={msg.id} conversationId={conversationId} />
              {msg.timestamp && (
                <time className="text-[9px] text-white/20 group-hover:text-white/40 transition-colors">
                  {new Date(msg.timestamp).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                </time>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function UpcomingCard({ events, tasks }) {
  if (!events?.length && !tasks) return null
  return (
    <div className="mx-4 mb-4 p-3.5 rounded-2xl" dir="rtl"
         style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}>
      {events?.length > 0 && (
        <>
          <p className="text-blue-300/60 text-[10px] font-medium mb-2 tracking-wider uppercase">אירועים קרובים</p>
          <div className="space-y-1.5">
            {events.map((e, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-base shrink-0">{e.emoji || '📅'}</span>
                <div>
                  <p className="text-white text-xs font-medium leading-snug">{e.title}</p>
                  <p className="text-blue-300/50 text-[10px]">{e.date}{e.time ? ` · ${e.time}` : ''}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {tasks > 0 && <p className="text-blue-300/60 text-xs mt-2">📋 {tasks} משימות פתוחות</p>}
    </div>
  )
}

function formatDate(iso) {
  try {
    const d = new Date(iso), now = new Date(), diff = now - d
    if (diff < 86400000)  return 'היום'
    if (diff < 172800000) return 'אתמול'
    return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })
  } catch { return '' }
}

function HistoryPanel({ history, onSelect, onClose, onDelete }) {
  return (
    <div className="fixed inset-0 z-50 flex" dir="rtl">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-80 max-w-[85vw] h-full flex flex-col shadow-2xl"
           style={{ background: 'linear-gradient(180deg,#0c1445 0%,#1a2f7a 100%)', borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
        <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
          <span className="text-white font-bold text-base">היסטוריית שיחות</span>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {!history.length
            ? <p className="text-blue-300/60 text-sm text-center mt-8 px-4">אין היסטוריה עדיין</p>
            : history.map((h, i) => (
              <div key={h.id || i} className="flex items-center gap-1 border-b border-white/5">
                <button onClick={() => onSelect(h)} className="flex-1 text-right px-4 py-3 hover:bg-white/8 transition-colors">
                  <p className="text-blue-300 text-[10px] mb-0.5">{formatDate(h.updated_at || h.created_at)}</p>
                  <p className="text-white text-sm truncate">{h.title}</p>
                </button>
                <button onClick={() => onDelete(h.id)}
                        className="w-8 h-8 flex items-center justify-center text-red-400/50 hover:text-red-300 transition-colors shrink-0 mr-2">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  )
}

function ViewingHistoryBanner({ title, onClose }) {
  return (
    <div className="mx-4 mb-2 px-4 py-2 rounded-xl flex items-center justify-between gap-2"
         style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }} dir="rtl">
      <span className="text-blue-200 text-xs truncate">{title || 'שיחה ישנה'}</span>
      <button onClick={onClose} className="text-blue-300 text-xs underline shrink-0">חזור לשיחה נוכחית</button>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function AiAssistant() {
  const { user }  = useAuth()
  const navigate  = useNavigate()
  const bottomRef  = useRef(null)
  const inputRef   = useRef(null)
  const abortRef   = useRef(null)
  const scrollRef  = useRef(null)
  const lastMsgRef = useRef('')

  const firstName = (user?.name || '').split(' ')[0]

  const freshGreeting = useCallback(() => [{
    id:           'greeting',
    role:         'assistant',
    content:      `שלום ${firstName} 👋\nאני כאן לעזור — קניות, יומן, משימות, מתכונים, שאלות — הכל.\n\nמה תרצה?`,
    timestamp:    new Date().toISOString(),
    actions:      [],
    sources:      [],
    images:       [],
    quickActions: [],
  }], [firstName])

  const [messages,       setMessages]       = useState(freshGreeting)
  const [input,          setInput]          = useState('')
  const [loading,        setLoading]        = useState(false)
  const [showHistory,    setShowHistory]    = useState(false)
  const [viewingHist,    setViewingHist]    = useState(null)
  const [familyInfo,     setFamilyInfo]     = useState(null)
  const [history,        setHistory]        = useState([])
  const [conversationId, setConversationId] = useState(null)
  const [showScrollBtn,  setShowScrollBtn]  = useState(false)

  // Load server conversation history on mount
  useEffect(() => {
    api.get('/api/ai/conversations').then(r => {
      setHistory(r.data?.conversations || [])
    }).catch(() => {})
  }, [user?._id])

  // Load upcoming family info on mount
  useEffect(() => {
    if (!user?.family_id) return
    ;(async () => {
      try {
        const today = new Date().toISOString().split('T')[0]
        const [evRes, taskRes] = await Promise.all([
          api.get('/api/calendar/').catch(() => ({ data: { events: [] } })),
          api.get('/api/tasks/').catch(()   => ({ data: { tasks:  [] } })),
        ])
        const upcoming = (evRes.data?.events || []).filter(e => e.date >= today).slice(0, 3)
        const tasks    = (taskRes.data?.tasks || []).length
        if (upcoming.length || tasks > 0) setFamilyInfo({ upcoming, tasks })
      } catch {}
    })()
  }, [user?._id])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') send()
      if (e.key === 'Escape' && loading && abortRef.current) {
        abortRef.current.abort(); abortRef.current = null; setLoading(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [loading])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const addAssistantMsg = useCallback(data => {
    setMessages(prev => [...prev, {
      id:           `a_${Date.now()}`,
      role:         'assistant',
      content:      data.content     || '',
      timestamp:    new Date().toISOString(),
      actions:      data.actions     || [],
      sources:      data.sources     || [],
      images:       data.images      || [],
      quickActions: data.quickActions || [],
      error:        data.error       || false,
    }])
  }, [])

  // ── Streaming sender ──────────────────────────────────────────────────────────
  const sendStreaming = useCallback(async (msg, historyForApi) => {
    const controller = new AbortController()
    abortRef.current = controller
    const assistId   = `a_${Date.now()}`

    setMessages(prev => [...prev, {
      id: assistId, role: 'assistant',
      content: '', streaming: true, status: '💭 חושב...',
      timestamp: new Date().toISOString(),
      actions: [], sources: [], images: [], quickActions: [],
    }])

    const upd = fn => setMessages(prev => prev.map(m => m.id === assistId ? fn(m) : m))

    try {
      const token = localStorage.getItem('fh_token')
      const res   = await fetch(`${API_BASE}/api/ai/agent/stream`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body:    JSON.stringify({ message: msg, history: historyForApi, conversation_id: conversationId }),
        signal:  controller.signal,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let   buffer  = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          let ev; try { ev = JSON.parse(line.slice(6)) } catch { continue }

          switch (ev.type) {
            case 'tool_start': {
              const toolLabels = {
                web_search:               `🔍 מחפש: ${ev.params_preview || ''}`,
                add_shopping_items:       '🛒 מוסיף לקניות...',
                create_event:             '📅 יוצר אירוע...',
                create_task:              '✅ יוצר משימה...',
                complete_task:            '✅ מסמן משימה...',
                delete_task:              '🗑️ מוחק משימה...',
                delete_event:             '🗑️ מוחק אירוע...',
                get_tasks:                '📋 טוען משימות...',
                get_shopping_list:        '🛒 טוען קניות...',
                get_upcoming_events:      '📅 טוען יומן...',
                send_push_notification:   '🔔 שולח התראה...',
              }
              upd(m => ({ ...m, status: toolLabels[ev.name] || `⚙️ ${ev.name}...` }))
              break
            }
            case 'status':
              upd(m => ({ ...m, status: ev.text }))
              break
            case 'tool_done':
              if (ev.name === 'web_search') {
                upd(m => ({
                  ...m,
                  sources: ev.result?.results || [],
                  images:  ev.result?.images  || [],
                  actions: [...m.actions, { tool: 'web_search', result: ev.result }],
                  status:  `נמצאו ${ev.result?.results?.length || 0} מקורות`,
                }))
              } else if (ev.success && ev.result) {
                upd(m => ({
                  ...m,
                  actions: [...m.actions, { tool: ev.name, result: ev.result }],
                  status:  null,
                }))
              } else {
                upd(m => ({ ...m, status: null }))
              }
              break
            case 'delta':
              upd(m => ({ ...m, content: m.content + ev.text, status: null }))
              break
            case 'done': {
              const finalContent = ev.reply || ''
              if (!finalContent.trim()) {
                upd(m => ({ ...m, content: 'לא הצלחתי לנסח תשובה — לחץ "נסה שוב"', streaming: false, status: null, error: true }))
                break
              }
              const qas = generateQuickActions(finalContent, ev.sources || [])
              if (ev.conversation_id) setConversationId(ev.conversation_id)
              upd(m => ({
                ...m,
                content:      finalContent,
                streaming:    false,
                status:       null,
                actions:      ev.actions?.length ? ev.actions : m.actions,
                sources:      ev.sources?.length ? ev.sources : m.sources,
                images:       ev.images?.length  ? ev.images  : m.images,
                quickActions: qas,
              }))
              api.get('/api/ai/conversations').then(r => setHistory(r.data?.conversations || [])).catch(() => {})
              break
            }
            case 'ask_user':
              upd(m => ({ ...m, content: ev.question || ev.text || '?', streaming: false, status: null }))
              setLoading(false)
              setTimeout(() => inputRef.current?.focus(), 100)
              return
            case 'error':
              upd(m => ({ ...m, content: ev.message || 'שגיאה', streaming: false, status: null, error: true }))
              break
          }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') return
      upd(m => ({ ...m, content: 'שגיאה בחיבור — לחץ "נסה שוב"', streaming: false, status: null, error: true }))
    } finally {
      abortRef.current = null
      upd(m => m.streaming ? { ...m, streaming: false, status: null } : m)
    }
  }, [conversationId])

  // ── Undo handler ──────────────────────────────────────────────────────────────
  const handleUndo = useCallback(async action => {
    try {
      if (action.tool === 'add_shopping_items' && action.result?.items?.length) {
        for (const name of action.result.items) {
          const res  = await api.get('/api/shopping/')
          const item = (res.data?.items || []).find(i => i.name === name)
          if (item) await api.delete(`/api/shopping/${item._id}`)
        }
      } else if (action.tool === 'create_task' && action.result?.title) {
        const res  = await api.get('/api/tasks/')
        const task = (res.data?.tasks || []).find(t => t.title === action.result.title)
        if (task) await api.delete(`/api/tasks/${task._id}`)
      } else if (action.tool === 'create_event' && action.result?.title) {
        const res = await api.get('/api/calendar/')
        const ev  = (res.data?.events || []).find(e => e.title === action.result.title)
        if (ev) await api.delete(`/api/calendar/${ev._id}`)
      }
    } catch {}
  }, [])

  // ── Main send ─────────────────────────────────────────────────────────────────
  const send = useCallback(async (text) => {
    if (viewingHist) return
    const msg = (text ?? input).trim()
    if (!msg || loading) return

    try { navigator.vibrate?.([10]) } catch {}
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null }

    lastMsgRef.current = msg
    setInput('')
    if (inputRef.current) inputRef.current.style.height = 'auto'

    setMessages(prev => [...prev, {
      id:        `u_${Date.now()}`,
      role:      'user',
      content:   msg,
      timestamp: new Date().toISOString(),
    }])
    setLoading(true)

    const historyForApi = messages
      .filter(m => (m.role === 'user' || m.role === 'assistant') && !m.streaming)
      .map(m => ({ role: m.role, content: m.content }))

    try {
      await sendStreaming(msg, historyForApi)
    } catch (err) {
      if (err?.name === 'AbortError') return
      addAssistantMsg({ content: err?.response?.data?.message || 'משהו השתבש — לחץ "נסה שוב"', error: true })
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [viewingHist, input, loading, messages, sendStreaming, addAssistantMsg])

  const retry = useCallback(() => {
    if (lastMsgRef.current) send(lastMsgRef.current)
  }, [send])

  const resetChat = () => {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null }
    setMessages(freshGreeting())
    setViewingHist(null)
    setConversationId(null)
    setInput('')
  }

  const loadServerConversation = async conv => {
    try {
      const res  = await api.get(`/api/ai/conversations/${conv.id}`)
      const msgs = (res.data?.messages || []).map((m, i) => ({
        id:           `hist_${i}`,
        role:         m.role,
        content:      m.content,
        timestamp:    m.timestamp,
        actions:      m.actions  || [],
        sources:      m.sources  || [],
        images:       [],
        quickActions: [],
      }))
      setViewingHist({ id: conv.id, title: conv.title, messages: msgs })
    } catch {}
    setShowHistory(false)
  }

  const deleteConversation = async id => {
    try { await api.delete(`/api/ai/conversations/${id}`) } catch {}
    setHistory(prev => prev.filter(h => h.id !== id))
  }

  const displayedMessages = viewingHist ? viewingHist.messages : messages
  const showSuggestions   = !viewingHist && messages.length === 1 && !loading
  const SUGGESTIONS       = getSuggestions()

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(175deg,#0c1445 0%,#1a2f7a 35%,#1d4ed8 75%,#2563eb 100%)' }}>

      {showHistory && (
        <HistoryPanel
          history={history}
          onClose={() => setShowHistory(false)}
          onSelect={loadServerConversation}
          onDelete={deleteConversation}
        />
      )}

      {/* Header */}
      <div className="fixed top-0 inset-x-0 z-30"
           style={{ background: 'rgba(12,20,69,0.88)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingTop: 'env(safe-area-inset-top,0px)' }}>
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
              <p className="text-blue-300 text-[11px] leading-none mt-0.5">מחובר · AI + אינטרנט</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setShowHistory(true)}
                    className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors relative">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {history.length > 0 && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-blue-400 rounded-full" />}
            </button>
            <button onClick={resetChat} title="שיחה חדשה"
                    className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <main ref={scrollRef}
            className="flex-1 overflow-y-auto max-w-2xl mx-auto w-full"
            style={{ paddingTop: '72px', paddingBottom: '130px' }}
            onScroll={e => {
              const el = e.currentTarget
              setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 150)
            }}>
        <div className="flex flex-col items-center pt-8 pb-6">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-400 to-indigo-700 flex items-center justify-center text-4xl shadow-2xl mb-3 ring-4 ring-white/10">🤖</div>
          <p className="text-white font-bold text-lg tracking-wide">עוזר המשפחה</p>
          <p className="text-blue-300 text-xs mt-1">מחובר לאינטרנט · שולט באפליקציה</p>
        </div>

        {viewingHist && <ViewingHistoryBanner title={viewingHist.title} onClose={() => setViewingHist(null)} />}

        {showSuggestions && familyInfo && (
          <UpcomingCard events={familyInfo.upcoming} tasks={familyInfo.tasks} />
        )}

        <div className="space-y-0.5 pb-2">
          {displayedMessages.map(msg => (
            <Message
              key={msg.id || msg.content?.slice(0, 20)}
              msg={msg}
              onQuickAction={qMsg => send(qMsg)}
              onRetry={msg.error ? retry : null}
              onUndo={handleUndo}
              conversationId={conversationId}
            />
          ))}

          {showSuggestions && (
            <div className="px-4 pt-2" dir="rtl">
              <p className="text-blue-300/70 text-xs mb-3 font-medium">נסה לשאול:</p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map(s => (
                  <button key={s.text} onClick={() => send(s.text)}
                          className="flex items-center gap-1.5 text-xs bg-white/10 hover:bg-white/18 border border-white/14 rounded-full px-3 py-1.5 text-white transition-all active:scale-95">
                    <span>{s.icon}</span><span>{s.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div ref={bottomRef} />
      </main>

      {/* Scroll-to-bottom */}
      {showScrollBtn && !viewingHist && (
        <button onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })}
                className="fixed bottom-32 left-1/2 -translate-x-1/2 z-30 bg-blue-600 hover:bg-blue-500 text-white text-xs px-4 py-2 rounded-full shadow-lg flex items-center gap-1.5 transition-all active:scale-95">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
          הודעה חדשה
        </button>
      )}

      {/* Input bar */}
      {!viewingHist && (
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
              <VoiceBtn
                onResult={text => { setInput(text); setTimeout(() => send(text), 100) }}
                disabled={loading}
              />
              {loading ? (
                <button
                  onClick={() => { if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; setLoading(false) } }}
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mb-0.5 bg-red-500/30 hover:bg-red-500/50 transition-all"
                  title="עצור">
                  <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="4" y="4" width="16" height="16" rx="2" />
                  </svg>
                </button>
              ) : (
                <button onClick={() => send()} disabled={!input.trim()}
                        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mb-0.5 transition-all disabled:opacity-25 active:scale-95"
                        style={{ background: input.trim() ? 'linear-gradient(135deg,#3b82f6,#6366f1)' : 'rgba(255,255,255,0.15)' }}>
                  <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  )
}
