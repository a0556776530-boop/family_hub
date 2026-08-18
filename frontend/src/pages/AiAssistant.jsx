import { useEffect, useRef, useState, useCallback } from 'react'
import BottomNav from '../components/layout/BottomNav'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000'

// ─── Routing patterns ─────────────────────────────────────────────────────────

// Modification verbs that need full LLM tool-use (calendar, complex ops)
const MODIFY_VERB_RE = /(?:תוסיף|הוסף|תכניס|הכנס|צור|תצור|תיצור|להוסיף|לצור|תכתוב|רשום|תרשום|הוסיפי|תוסיפי|הכניסי|תכניסי|קח|תקח|שים|תשים|תמחק|מחק|הסר|תסיר|למחוק|להסיר|תבטל|בטל|מחקי|תמחקי|סמן|תסמן|בצע|תבצע|השלם|תשלים|סיימתי|גמרתי)/

// Destructive operations that need confirmation before executing
const DESTRUCTIVE_RE = /(?:מחק|תמחק|נקה|תנקה|הסר|תסיר)\s+(?:הכל|כל\s+ה|את\s+כל|הרשימה\s+כולה|כולם|הכל\s+מה)/i

// Mixed intent: "find X AND add to shopping" → stream first, action follows
const MIXED_INTENT_RE = /(?:תמצא|חפש|מצא)\s+.+?\s+ו(?:תוסיף|הוסף)\s+(?:את\s+)?(?:המצרכים|הרכיבים|המרכיבים|הכל|אותם)/i

// ─── Local intent detection (zero network, instant) ───────────────────────────

const ADD_VERBS    = /(?:תוסיף|הוסף|תכניס|הכנס|צור|תצור|תיצור|להוסיף|לצור|תכתוב|רשום|תרשום|הוסיפי|תוסיפי|הכניסי|תכניסי|קח|תקח|קחי|שים|תשים)/
const SHOW_VERBS   = /(?:תראה|הראה|הצג|תציג|תפרט|מה\s+(?:יש|המ)|הצג|מהי|רוצה\s+לראות)/
const DELETE_VERBS = /(?:תמחק|מחק|הסר|תסיר|למחוק|להסיר|תבטל|בטל|מחקי|תמחקי|הסירי)/
const DONE_VERBS   = /(?:סיימתי|סמן|תסמן|בוצע|הושלם|השלם|עשיתי|גמרתי|סיים|גמר|ביצעתי|סמני|תסמני)/
const WANT_ADD     = /(?:אשמח\s+(?:אם\s+)?(?:ש)?(?:ת(?:וסיף|כניס|צור))|רוצה\s+(?:ש)?(?:תוסיף|להוסיף|להכניס|לצור)|אפשר\s+(?:ש)?(?:תוסיף|להוסיף)|(?:אני\s+)?(?:צריך|צריכה)\s+(?:ש)?(?:תוסיף|להוסיף)|בוא\s+(?:ת)?(?:וסיף|כניס|צור)|תוכל(?:י)?\s+(?:ל)?(?:הוסיף|הכניס|צור))/
const SHOP_CTX     = /(?:לקני(?:ות|ה|ון)|לרשימ[הת](?:\s+(?:ה)?קניות)?|לסופר|למרכול|למכולת|לפרמסייה|בקניות|ברשימ[הת]|לקנות|לחנות)/
const TASK_CTX     = /(?:משימ[הות]|תזכורת|ל(?:עשות|לעשות)|לרשימת\s+המשימות|למשימות|הרשימה\s+שלי)/
const NOISE_WORDS  = /(?:אשמח|אודה|תוכל|תוכלי|בבקשה|נא|אם\s+אפשר|אני\s+רוצה|אני|רוצה|אפשר|בוא|יכול|יכולה|שתוסיף|שתכניס|שתצור|שתמחק)\b/gi

function stripNoise(s) {
  return s
    .replace(ADD_VERBS,    '').replace(DELETE_VERBS, '').replace(DONE_VERBS, '')
    .replace(NOISE_WORDS,  '')
    .replace(/(?:משימ[הות]|תזכורת|למשימות|לרשימת\s+המשימות)/gi, '')
    .replace(/(?:לקני(?:ות|ה|ון)|לרשימ[הת](?:\s+(?:ה)?קניות)?|לסופר|למרכול|למכולת|בקניות|ברשימ[הת]|לקנות|לחנות)/gi, '')
    .replace(/(?:^|\s)(?:את|לי|ה|ל|מ|ב|כ|ו|אני|אתה|את|הם|הן|אנחנו|בבקשה|נא|גם|עוד)\s/gi, ' ')
    .replace(/\s+/g, ' ').trim().replace(/^[,.\-:]+|[,.\-:?!]+$/g, '').trim()
}

function detectIntent(msg) {
  const m       = msg.trim()
  const hasAdd  = ADD_VERBS.test(m) || WANT_ADD.test(m)
  const hasShow = SHOW_VERBS.test(m) || /^(?:מה|כמה|מי|הצג|רשימ)/.test(m)
  const hasDel  = DELETE_VERBS.test(m)
  const hasDone = DONE_VERBS.test(m)
  const isShop  = SHOP_CTX.test(m)
  const isTask  = TASK_CTX.test(m)

  if (hasAdd && isTask && !isShop) {
    let title = m.replace(/^.*?(?:משימ[הות]|תזכורת)\s*/i, '').trim()
    title = stripNoise(title)
    if (!title || title.length < 2) title = stripNoise(m)
    if (title && title.length > 1) return { intent: 'add_task', title }
  }
  if (hasAdd && isShop) {
    let raw = m.replace(/\s*(?:לקני(?:ות|ה|ון)|לרשימ[הת](?:\s+(?:ה)?קניות)?|לסופר|למרכול|למכולת|לפרמסייה|בקניות|ברשימ[הת]|לקנות|לחנות).*/i, '')
    raw = stripNoise(raw)
    const items = raw.split(/\s*[,ו]\s*|\s+ו(?=\S)/).map(s => s.trim()).filter(s => s.length > 1)
    if (items.length) return { intent: 'add_shopping', items }
  }
  if (/(?:צריך|צריכה|חסר|חסרה)\s+(?:לנו\s+)?(?:עוד\s+)?(?!\s*ל(?:עשות|לעשות))/.test(m) && (isShop || !isTask)) {
    let raw = stripNoise(m.replace(/(?:צריך|צריכה|חסר|חסרה)\s+(?:לנו\s+)?(?:עוד\s+)?/i, '').replace(SHOP_CTX, '').trim())
    const items = raw.split(/\s*[,ו]\s*|\s+ו(?=\S)/).map(s => s.trim()).filter(s => s.length > 1)
    if (items.length > 0 && items[0].length > 1) return { intent: 'add_shopping', items }
  }
  if (isTask && (hasShow || /^(?:מה|הצג|תראה|רשימ)/.test(m))) return { intent: 'get_tasks' }
  if (/(?:מה\s+(?:ה)?משימות|משימות\s+פתוחות|כל\s+המשימות)/.test(m))    return { intent: 'get_tasks' }
  if (isShop && (hasShow || /^(?:מה|הצג|תראה|רשימ)/.test(m)))            return { intent: 'get_shopping' }
  if (/(?:מה\s+(?:יש\s+)?(?:ב)?(?:ה)?קניות|מה\s+(?:יש\s+)?ברשימ)/.test(m)) return { intent: 'get_shopping' }
  if (hasDel && isTask) { const t = stripNoise(m); if (t && t.length > 1) return { intent: 'delete_task', title: t } }
  if (hasDone && isTask) { const t = stripNoise(m); if (t && t.length > 1) return { intent: 'complete_task', title: t } }
  return null
}

async function executeIntent(intent) {
  switch (intent.intent) {
    case 'add_task': {
      await api.post('/api/tasks/', { title: intent.title, priority: 'medium' })
      return { reply: `✅ נוצרה משימה: **${intent.title}**`, actions: [{ tool: 'create_task', result: { created: true } }] }
    }
    case 'add_shopping': {
      const added = []
      for (const name of intent.items) {
        try { await api.post('/api/shopping/', { name }); added.push(name) } catch {}
      }
      if (!added.length) return null
      return { reply: `🛒 נוסף לקניות: ${added.join(', ')}`, actions: [{ tool: 'add_shopping_items', result: { added: added.length, items: added } }] }
    }
    case 'get_tasks': {
      const res = await api.get('/api/tasks/')
      const tasks = res.data?.tasks || []
      if (!tasks.length) return { reply: 'אין משימות פתוחות כרגע 🎉', actions: [] }
      const lines = tasks.slice(0, 10).map(t => `• ${t.title}`).join('\n')
      return { reply: `📋 **משימות פתוחות (${tasks.length}):**\n${lines}`, actions: [] }
    }
    case 'get_shopping': {
      const res = await api.get('/api/shopping/')
      const items = res.data?.items || []
      if (!items.length) return { reply: 'רשימת הקניות ריקה 🛒', actions: [] }
      const lines = items.slice(0, 15).map(i => `${i.done ? '✅' : '•'} ${i.name}`).join('\n')
      return { reply: `🛒 **רשימת קניות (${items.length} פריטים):**\n${lines}`, actions: [] }
    }
    case 'delete_task': {
      const res   = await api.get('/api/tasks/')
      const tasks = res.data?.tasks || []
      const match = tasks.find(t => t.title.includes(intent.title) || intent.title.includes(t.title))
      if (!match) return { reply: `לא מצאתי משימה בשם "${intent.title}"`, actions: [] }
      await api.delete(`/api/tasks/${match._id}`)
      return { reply: `🗑️ המשימה "${match.title}" נמחקה.`, actions: [{ tool: 'delete_task', result: { deleted: 1 } }] }
    }
    case 'complete_task': {
      const res   = await api.get('/api/tasks/')
      const tasks = res.data?.tasks || []
      const match = tasks.find(t => t.title.includes(intent.title) || intent.title.includes(t.title))
      if (!match) return { reply: `לא מצאתי משימה בשם "${intent.title}"`, actions: [] }
      await api.patch(`/api/tasks/${match._id}/complete`)
      return { reply: `🎉 משימה הושלמה: **${match.title}**`, actions: [{ tool: 'complete_task', result: { completed: true } }] }
    }
    default: return null
  }
}

// ─── Suggestions (time-aware) ─────────────────────────────────────────────────

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

// ─── Markdown inline parser ────────────────────────────────────────────────────

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

// ─── UI sub-components ─────────────────────────────────────────────────────────

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
      {source.content && (
        <p className="text-blue-300/70 text-[10.5px] leading-snug line-clamp-2 pr-6">{source.content}</p>
      )}
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
  // Recipe with ingredients → offer to add to shopping
  if (/(?:מצרכים|מרכיבים|כפית|כפות|כוס|גרם|מ"ל|ק"ג|ליטר|קמח|שמן|מלח|סוכר)/.test(content))
    acts.push({ label: '🛒 הוסף מצרכים לקניות', message: 'תוסיף את המצרכים של המתכון הזה לרשימת הקניות' })
  // Has sources → offer to search more
  if (sources.length > 0 && acts.length === 0)
    acts.push({ label: '🔍 מצא עוד מידע', message: 'תמצא לי עוד מידע על הנושא הזה' })
  // Has recipe structure → offer to save
  if (/(?:הכנה|הוראות|שלב\s+\d|שוטפים|מחממים|מערבבים|מבשלים)/.test(content))
    acts.push({ label: '📤 שתף עם המשפחה', message: '' })
  return acts.slice(0, 3)
}

function QuickActions({ actions, onAction }) {
  if (!actions?.length) return null
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {actions.map((a, i) => (
        <button key={i}
          onClick={() => a.message && onAction(a.message)}
          disabled={!a.message}
          className="flex items-center gap-1.5 text-xs bg-blue-500/20 hover:bg-blue-500/35 border border-blue-400/25 hover:border-blue-400/40 rounded-full px-3.5 py-1.5 text-white transition-all active:scale-95 disabled:opacity-50">
          {a.label}
        </button>
      ))}
    </div>
  )
}

function ToolBadges({ actions }) {
  if (!actions?.length) return null
  const map = {
    web_search:               r => r?.results?.length > 0 ? `🔍 ${r.results.length} מקורות` : null,
    add_shopping_items:       r => r?.added > 0 ? `🛒 ${r.added} נוספו` : null,
    delete_shopping_item:     r => r?.deleted > 0 ? `🗑️ נמחק` : null,
    toggle_shopping_done:     r => r?.updated > 0 ? `✔️ עודכן` : null,
    clear_completed_shopping: r => r?.deleted > 0 ? `🧹 ${r.deleted} נוקו` : null,
    create_event:             r => r?.created  ? `📅 ביומן` : null,
    update_event:             r => r?.updated  ? `✏️ יומן` : null,
    delete_event:             r => r?.deleted > 0 ? `🗑️ אירוע` : null,
    create_task:              r => r?.created  ? `✅ משימה` : null,
    complete_task:            r => r?.completed ? `🎉 הושלמה` : null,
    delete_task:              r => r?.deleted > 0 ? `🗑️ נמחקה` : null,
    update_task:              r => r?.updated  ? `✏️ עודכנה` : null,
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

// ─── Confirmation dialog ───────────────────────────────────────────────────────

function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative rounded-2xl p-6 max-w-sm w-full shadow-2xl"
        style={{ background: 'linear-gradient(135deg, #0f1e5a 0%, #1a2f7a 100%)', border: '1px solid rgba(255,255,255,0.15)' }}>
        <div className="text-3xl text-center mb-3">⚠️</div>
        <p className="text-white font-bold text-base text-center mb-2">אישור נדרש</p>
        <p className="text-blue-200/90 text-sm text-center leading-relaxed mb-6">
          {message}
          <br /><span className="text-blue-300/60 text-xs">פעולה זו לא ניתנת לביטול</span>
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/18 text-white text-sm font-medium transition-colors">
            ביטול
          </button>
          <button onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-400 active:bg-red-600 text-white text-sm font-bold transition-colors">
            כן, בצע
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Message component ─────────────────────────────────────────────────────────

function Message({ msg, onQuickAction, onRetry }) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end px-4 py-1" dir="ltr">
        <div className="max-w-[82%] bg-white text-gray-900 rounded-2xl rounded-br-sm px-4 py-2.5 shadow-md">
          <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ direction: 'rtl', textAlign: 'right' }}>{msg.content}</p>
        </div>
      </div>
    )
  }

  const hasSources   = msg.sources?.length > 0
  const hasImages    = msg.images?.length > 0
  const hasQuickActs = msg.quickActions?.length > 0

  return (
    <div className="px-4 py-1.5 group" dir="rtl">
      <div className="flex gap-2.5 items-start">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400/60 to-indigo-600/60 border border-white/20 flex items-center justify-center text-[17px] shrink-0 shadow mt-0.5">🤖</div>
        <div className="flex-1 min-w-0">

          {/* Status pill */}
          {msg.status && (
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-blue-200/80 bg-white/6 border border-white/10 rounded-full px-3 py-1 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse shrink-0" />
                {msg.status}
              </span>
            </div>
          )}

          {/* Main bubble */}
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

              {/* Copy button — appears on hover */}
              {!msg.streaming && msg.content && (
                <div className="absolute top-2 left-2">
                  <CopyBtn text={msg.content} />
                </div>
              )}
            </div>
          )}

          {/* Error retry */}
          {msg.error && onRetry && (
            <button onClick={onRetry}
              className="mt-2 text-xs text-blue-300/70 hover:text-blue-200 underline flex items-center gap-1 transition-colors">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              נסה שוב
            </button>
          )}

          {/* Sources */}
          {!msg.streaming && hasSources && (
            <div className="mt-2.5">
              <p className="text-blue-300/50 text-[10px] mb-1.5 font-medium tracking-wider uppercase">מקורות</p>
              <div className="grid gap-1.5">
                {msg.sources.slice(0, 4).map((s, i) => <SourceCard key={i} source={s} />)}
              </div>
            </div>
          )}

          {/* Images */}
          {!msg.streaming && hasImages && <ImageGrid images={msg.images} />}

          {/* Tool badges */}
          {!msg.streaming && <ToolBadges actions={msg.actions} />}

          {/* Quick actions */}
          {!msg.streaming && hasQuickActs && (
            <QuickActions actions={msg.quickActions} onAction={onQuickAction} />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Upcoming events card ──────────────────────────────────────────────────────

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
      {tasks > 0 && (
        <p className="text-blue-300/60 text-xs mt-2">📋 {tasks} משימות פתוחות</p>
      )}
    </div>
  )
}

// ─── History ───────────────────────────────────────────────────────────────────

function formatDate(iso) {
  const d = new Date(iso), now = new Date(), diff = now - d
  if (diff < 86400000)  return 'היום'
  if (diff < 172800000) return 'אתמול'
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })
}

function HistoryPanel({ history, onSelect, onClose, onClear }) {
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
          {history.length === 0
            ? <p className="text-blue-300/60 text-sm text-center mt-8 px-4">אין היסטוריה עדיין</p>
            : history.map((h, i) => (
              <button key={i} onClick={() => onSelect(h)}
                className="w-full text-right px-4 py-3 hover:bg-white/8 transition-colors border-b border-white/5">
                <p className="text-blue-300 text-[10px] mb-0.5">{formatDate(h.date)} · {h.count} הודעות</p>
                <p className="text-white text-sm truncate">{h.preview}</p>
              </button>
            ))
          }
        </div>
        {history.length > 0 && (
          <button onClick={onClear}
            className="mx-4 mb-4 py-2 rounded-xl text-red-300 text-sm border border-red-400/30 hover:bg-red-400/10 transition-colors">
            נקה היסטוריה
          </button>
        )}
      </div>
    </div>
  )
}

function ViewingHistoryBanner({ date, onClose }) {
  return (
    <div className="mx-4 mb-2 px-4 py-2 rounded-xl flex items-center justify-between gap-2"
      style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }} dir="rtl">
      <span className="text-blue-200 text-xs">מציג שיחה מ-{formatDate(date)}</span>
      <button onClick={onClose} className="text-blue-300 text-xs underline">חזור לשיחה נוכחית</button>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function AiAssistant() {
  const { user }  = useAuth()
  const navigate  = useNavigate()
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)
  const abortRef  = useRef(null)
  const lastMsgRef = useRef('')   // for retry

  const firstName   = (user?.name || '').split(' ')[0]
  const fid         = user?.family_id || 'default'
  const HISTORY_KEY = `ai_history_${fid}`

  const freshGreeting = () => [{
    id: 'greeting', role: 'assistant',
    content: `שלום ${firstName} 👋\nאני כאן לעזור — קניות, יומן, משימות, מתכונים, שאלות — הכל.\n\nמה תרצה?`,
    actions: [], sources: [], images: [], quickActions: [],
  }]

  const [messages,      setMessages]      = useState(freshGreeting)
  const [input,         setInput]         = useState('')
  const [loading,       setLoading]       = useState(false)
  const [showHistory,   setShowHistory]   = useState(false)
  const [viewingHist,   setViewingHist]   = useState(null)
  const [pendingConfirm, setPendingConfirm] = useState(null)  // { msg, label }
  const [familyInfo,    setFamilyInfo]    = useState(null)    // { upcoming, tasks }
  const [history,       setHistory]       = useState(() => {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') } catch { return [] }
  })

  // Load upcoming family context on mount
  useEffect(() => {
    if (!user?.family_id) return
    ;(async () => {
      try {
        const today = new Date().toISOString().split('T')[0]
        const [evRes, taskRes] = await Promise.all([
          api.get('/api/calendar/').catch(() => ({ data: { events: [] } })),
          api.get('/api/tasks/').catch(() => ({ data: { tasks: [] } })),
        ])
        const upcoming = (evRes.data?.events || []).filter(e => e.date >= today).slice(0, 3)
        const tasks    = (taskRes.data?.tasks || []).length
        if (upcoming.length || tasks > 0) setFamilyInfo({ upcoming, tasks })
      } catch {}
    })()
  }, [user?._id])

  const loadHistory = () => { try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') } catch { return [] } }

  const saveToHistory = useCallback((msgs) => {
    const userMsgs = msgs.filter(m => m.role === 'user')
    if (!userMsgs.length) return
    const entry   = { date: new Date().toISOString(), preview: userMsgs[0].content.slice(0, 60), count: msgs.length, messages: msgs.slice(-40) }
    const updated = [entry, ...loadHistory()].slice(0, 20)
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(updated)) } catch {}
    setHistory(updated)
  }, [HISTORY_KEY])

  useEffect(() => {
    return () => {
      setMessages(cur => {
        if (cur.filter(m => m.role === 'user').length > 0) saveToHistory(cur)
        return cur
      })
    }
  }, [saveToHistory])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const addAssistantMsg = useCallback((data) => {
    setMessages(prev => [...prev, {
      id:           `a_${Date.now()}`,
      role:         'assistant',
      content:      data.content || '',
      actions:      data.actions  || [],
      sources:      data.sources  || [],
      images:       data.images   || [],
      quickActions: data.quickActions || [],
      error:        data.error    || false,
    }])
  }, [])

  // ── Streaming sender ────────────────────────────────────────────────────────

  const sendStreaming = useCallback(async (msg, historyForApi) => {
    const controller = new AbortController()
    abortRef.current = controller
    const assistId   = `a_${Date.now()}`

    setMessages(prev => [...prev, {
      id: assistId, role: 'assistant',
      content: '', streaming: true, status: '💭 חושב...',
      actions: [], sources: [], images: [], quickActions: [],
    }])

    const upd = (fn) => setMessages(prev => prev.map(m => m.id === assistId ? fn(m) : m))

    try {
      const token = localStorage.getItem('fh_token')
      const res   = await fetch(`${API_BASE}/api/ai/chat/stream`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body:    JSON.stringify({ message: msg, history: historyForApi }),
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
            case 'status':
              upd(m => ({ ...m, status: ev.text }))
              break
            case 'tool_done':
              if (ev.name === 'web_search')
                upd(m => ({
                  ...m,
                  sources: ev.result?.results || [],
                  images:  ev.result?.images  || [],
                  actions: [...m.actions, { tool: 'web_search', result: ev.result }],
                  status:  `נמצאו ${ev.result?.results?.length || 0} מקורות`,
                }))
              break
            case 'delta':
              upd(m => ({ ...m, content: m.content + ev.text, status: null }))
              break
            case 'done': {
              const finalContent = ev.reply || ''
              const qas = generateQuickActions(finalContent, ev.sources || [])
              upd(m => ({
                ...m,
                content:      finalContent,
                streaming:    false,
                status:       null,
                actions:      ev.actions?.length  ? ev.actions  : m.actions,
                sources:      ev.sources?.length  ? ev.sources  : m.sources,
                images:       ev.images?.length   ? ev.images   : m.images,
                quickActions: qas,
              }))
              break
            }
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
  }, [])

  // ── Main send ───────────────────────────────────────────────────────────────

  const send = useCallback(async (text, skipConfirm = false) => {
    if (viewingHist) return
    const msg = (text ?? input).trim()
    if (!msg || loading) return

    // Destructive check — show confirm dialog first
    if (!skipConfirm && DESTRUCTIVE_RE.test(msg)) {
      setPendingConfirm({ msg, label: msg })
      return
    }

    // Cancel any in-flight stream
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null }

    lastMsgRef.current = msg
    setInput('')
    if (inputRef.current) inputRef.current.style.height = 'auto'

    setMessages(prev => [...prev, { id: `u_${Date.now()}`, role: 'user', content: msg }])
    setLoading(true)

    const historyForApi = messages
      .filter(m => (m.role === 'user' || m.role === 'assistant') && !m.streaming)
      .map(m => ({ role: m.role, content: m.content }))

    try {
      // 1. Local instant path (zero network for common ops)
      const intent = detectIntent(msg)
      if (intent) {
        const result = await executeIntent(intent)
        if (result) { addAssistantMsg(result); return }
      }

      // 2. Mixed intent: "תמצא X ותוסיף Y" → stream the search, action follows via quick button
      if (MIXED_INTENT_RE.test(msg)) {
        const searchOnly = msg.replace(/\s*ו(?:תוסיף|הוסף)\s+(?:את\s+)?(?:המצרכים|הרכיבים|המרכיבים|הכל|אותם)\s*(?:לקניות|לרשימה)?/i, '').trim()
        await sendStreaming(searchOnly, historyForApi)
        return
      }

      // 3. Modify verbs → non-streaming endpoint (full LLM tool-use: calendar, events, etc.)
      if (MODIFY_VERB_RE.test(msg)) {
        const res = await api.post('/api/ai/chat', { message: msg, history: historyForApi })
        addAssistantMsg({ content: res.data.reply, actions: res.data.actions || [] })
        return
      }

      // 4. Knowledge / search → streaming
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
    if (lastMsgRef.current) send(lastMsgRef.current, true)
  }, [send])

  const resetChat = () => {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null }
    saveToHistory(messages)
    setMessages(freshGreeting())
    setViewingHist(null)
  }

  const displayedMessages = viewingHist ? viewingHist.messages : messages
  const showSuggestions   = !viewingHist && messages.length === 1 && !loading
  const SUGGESTIONS       = getSuggestions()

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(175deg,#0c1445 0%,#1a2f7a 35%,#1d4ed8 75%,#2563eb 100%)' }}>

      {/* Confirmation dialog */}
      {pendingConfirm && (
        <ConfirmDialog
          message={`האם אתה בטוח שאתה רוצה לבצע: "${pendingConfirm.label}"?`}
          onConfirm={() => { const m = pendingConfirm.msg; setPendingConfirm(null); send(m, true) }}
          onCancel={() => setPendingConfirm(null)}
        />
      )}

      {showHistory && (
        <HistoryPanel
          history={history}
          onClose={() => setShowHistory(false)}
          onSelect={h => { setViewingHist(h); setShowHistory(false) }}
          onClear={() => {
            try { localStorage.removeItem(HISTORY_KEY) } catch {}
            setHistory([])
            setShowHistory(false)
          }}
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
            <button onClick={resetChat}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              title="שיחה חדשה">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto max-w-2xl mx-auto w-full" style={{ paddingTop: '72px', paddingBottom: '130px' }}>
        <div className="flex flex-col items-center pt-8 pb-6">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-400 to-indigo-700 flex items-center justify-center text-4xl shadow-2xl mb-3 ring-4 ring-white/10">🤖</div>
          <p className="text-white font-bold text-lg tracking-wide">עוזר המשפחה</p>
          <p className="text-blue-300 text-xs mt-1">מחובר לאינטרנט · שולט באפליקציה</p>
        </div>

        {viewingHist && <ViewingHistoryBanner date={viewingHist.date} onClose={() => setViewingHist(null)} />}

        {/* Upcoming events card — shows on fresh chat */}
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
