import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Header from '../components/layout/Header'
import BottomNav from '../components/layout/BottomNav'
import api from '../api/client'

// ── Categories ──────────────────────────────────────────────────────────────
const CATEGORIES = ['ירקות', 'פירות', 'מזון', 'ניקיון', 'פארם', 'תינוקות', 'אחר']
const CATEGORY_EMOJI  = { ירקות: '🥦', פירות: '🍎', מזון: '🥫', ניקיון: '🧹', פארם: '💊', תינוקות: '🍼', אחר: '🛒' }
const CATEGORY_LABEL  = { ירקות: 'ירקות ופירות', פירות: 'ירקות ופירות', מזון: 'מזון', ניקיון: 'ניקיון', פארם: 'פארם וטיפוח', תינוקות: 'תינוקות', אחר: 'שונות' }

// ── Smart Emoji Engine ───────────────────────────────────────────────────────
const KEYWORD_EMOJI = [
  ['חלב 3%','🥛'],['חלב 1%','🥛'],['חלב דל לקטוז','🥛'],['חלב',  '🥛'],
  ['שמנת חמוצה','🥛'],['שמנת','🥛'],['לבן','🥛'],['יוגורט יווני','🥛'],['יוגורט','🥛'],
  ['גבינת שמנת','🧀'],['גבינה צהובה','🧀'],['גבינה בולגרית','🧀'],['גבינת עיזים','🧀'],
  ['מוצרלה','🧀'],['פרמזן','🧀'],['ריקוטה','🧀'],['גבינה לבנה','🧀'],['קוטג','🧀'],
  ['חמאה','🧈'],['מרגרינה','🧈'],
  ['ביצים','🥚'],['ביצה','🥚'],
  ['לחם מלא','🍞'],['לחם שיפון','🍞'],['לחם כוסמין','🍞'],['לחם','🍞'],
  ['לחמניות','🥖'],['בגט','🥖'],['חלה','🥐'],['קרואסון','🥐'],['בייגלה','🥯'],
  ['פיתות','🫓'],['פיתה','🫓'],['טורטייה','🫓'],
  ['עגבנייה שרי','🍅'],['עגבנייה','🍅'],['עגבניות','🍅'],
  ['מלפפון','🥒'],['זוקיני','🥒'],
  ['חסה','🥬'],['תרד','🥬'],['כרוב','🥬'],
  ['ברוקולי','🥦'],['כרובית','🥦'],
  ['גזר','🥕'],['בצל ירוק','🧅'],['בצל','🧅'],['שום','🧄'],
  ['תפוח אדמה','🥔'],['בטטה','🍠'],['תירס','🌽'],
  ['פלפל אדום','🫑'],['פלפל ירוק','🫑'],['פלפל','🫑'],
  ['אבוקדו','🥑'],['פטרייה','🍄'],['חציל','🍆'],['דלעת','🎃'],
  ['אספרגוס','🌿'],['כרישה','🌿'],['סלרי','🌿'],
  ['תפוח','🍎'],['אגס','🍐'],['בננה','🍌'],['תפוז','🍊'],['מנדרינה','🍊'],
  ['לימון','🍋'],['ענבים','🍇'],['אבטיח','🍉'],['מלון','🍈'],
  ['תות','🍓'],['פטל','🫐'],['אוכמניות','🫐'],['קיווי','🥝'],
  ['מנגו','🥭'],['אננס','🍍'],['אפרסק','🍑'],['נקטרינה','🍑'],['שזיף','🍑'],
  ['רימון','🍎'],['תמרים','🌴'],
  ['שקדים','🌰'],['אגוזי מלך','🌰'],['קשיו','🌰'],['פיסטוק','🌰'],
  ['בוטנים','🥜'],['צימוקים','🍇'],['משמש יבש','🍑'],
  ['חזה עוף','🍗'],['כרעיים','🍗'],['כנפיים','🍗'],['פרגית','🍗'],
  ['שניצל עוף','🍗'],['קציצות עוף','🍗'],['עוף','🍗'],['הודו','🦃'],
  ['סטייק','🥩'],['בשר טחון','🥩'],['המבורגר','🥩'],['בשר','🥩'],
  ['נקניקיות','🌭'],['קציצות','🥩'],
  ['סלמון','🐟'],['פילה דג','🐟'],['דג','🐟'],['טונה','🐟'],
  ['גמבה','🦐'],['שרימפס','🦐'],
  ['אורז מלא','🍚'],['אורז','🍚'],
  ['ספגטי','🍝'],['מקרוני','🍝'],['פסטה','🍝'],
  ['קוסקוס','🍚'],['פתיתים','🍚'],['קינואה','🌾'],
  ['שיבולת שועל','🌾'],['קמח תירס','🌾'],['קמח מלא','🌾'],['קמח','🌾'],
  ['גרנולה','🥣'],['קורנפלקס','🥣'],
  ['שמן זית','🫒'],['שמן','🫙'],['חומץ','🫙'],
  ['רסק עגבניות','🍅'],['קטשופ','🍅'],['מיונז','🫙'],['חרדל','🫙'],
  ['טחינה','🫙'],['חומוס','🫙'],
  ['מלח','🧂'],['פלפל שחור','🧂'],['פפריקה','🧂'],['כמון','🧂'],
  ['קינמון','🧂'],['כורכום','🧂'],
  ['ממרח שוקולד','🍫'],['שוקולד','🍫'],['קיטקט','🍫'],['מילקה','🍫'],
  ['חלבה','🍬'],['סוכר חום','🍬'],['סוכר','🍬'],['דבש','🍯'],['ריבה','🍯'],
  ['עוגיות','🍪'],['ביסקוויט','🍪'],['וופל','🧇'],['רוגלך','🍪'],
  ['ביסלי','🍿'],['במבה','🍿'],['פרינגלס','🥔'],['ציפס','🥔'],['פופקורן','🍿'],
  ['גלידה','🍦'],['ארטיק','🍦'],
  ['מים מינרלים','💧'],['מים מוגזים','💧'],['מים','💧'],
  ['קולה','🥤'],['ספרייט','🥤'],['פנטה','🥤'],['רד בול','⚡'],
  ['מיץ תפוזים','🧃'],['מיץ תפוחים','🧃'],['מיץ','🧃'],['נקטר','🧃'],
  ['תה קר','🧃'],['קפה קר','☕'],
  ['בירה','🍺'],['יין','🍷'],['שמפניה','🍾'],
  ['קפסולות קפה','☕'],['אספרסו','☕'],['קפה','☕'],
  ['תה שחור','🍵'],['תה ירוק','🍵'],['תה נענע','🍵'],['תה','🍵'],
  ['קקאו','🍫'],['שוקו','🥛'],
  ['נייר טואלט','🧻'],['מגבות נייר','🧻'],
  ['שקיות אשפה','🗑️'],['ניילון נצמד','🛍️'],['שקיות ניילון','🛍️'],
  ['אבקת כביסה','🧺'],['נוזל כביסה','🧺'],['מרכך כביסה','🧺'],
  ['נוזל כלים','🧼'],['ספוגיות','🧽'],['ספוג','🧽'],
  ['נוזל רצפה','🧴'],['קרם שירותים','🧴'],['מנקה','🧴'],
  ['נייר כסף','✨'],['מגב','🪣'],['מטאטא','🧹'],
  ['טאבלטים למדיח','✨'],['מלח למדיח','🧂'],
  ['שמפו','🧴'],['מרכך שיער','🧴'],['סבון ידיים','🧼'],['סבון גוף','🧼'],['סבון','🧼'],
  ['קרם גוף','🧴'],['קרם פנים','🧴'],['קרם שמש','🧴'],['קרם','🧴'],
  ['דאודורנט','🧴'],['משחת שיניים','🪥'],['מברשת שיניים','🪥'],
  ['חוט דנטלי','🪥'],['שפתון','💄'],['קצף גילוח','🧴'],
  ['אספירין','💊'],['פרמול','💊'],['אקמול','💊'],['פלסטרים','🩹'],
  ['ויטמין C','🍊'],['ויטמין','💊'],['מגנזיום','💊'],
  ['חיתולים','👶'],['מגבונים לחים','🧻'],['מגבונים','🧻'],
  ['פורמולה','🍼'],['דייסת תינוקות','🍼'],['שנוצר','👶'],
].sort((a, b) => b[0].length - a[0].length)

function getItemEmoji(name = '', category = 'אחר') {
  const lower = name.toLowerCase()
  for (const [kw, emoji] of KEYWORD_EMOJI) {
    if (lower.includes(kw)) return emoji
  }
  return CATEGORY_EMOJI[category] || '🛒'
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Shopping() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [items, setItems]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [showModal, setShowModal] = useState(searchParams.get('new') === '1')
  const [filter, setFilter]       = useState('all')
  const [frequent, setFrequent]   = useState([])

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowModal(true)
      setSearchParams({}, { replace: true })
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [itemsRes, freqRes] = await Promise.all([
        api.get('/api/shopping/'),
        api.get('/api/shopping/frequent'),
      ])
      setItems(itemsRes.data.items)
      setFrequent(freqRes.data.items)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const toggle = async (item) => {
    const res = await api.patch(`/api/shopping/${item.id}/toggle`)
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, done: res.data.done } : i))
  }

  const remove = async (id) => {
    await api.delete(`/api/shopping/${id}`)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  const adjustQty = async (id, delta) => {
    const res = await api.patch(`/api/shopping/${id}/quantity`, { delta })
    setItems(prev => prev.map(i => i.id === id ? { ...i, quantity: res.data.quantity } : i))
  }

  const clearDone = async () => {
    const done = items.filter(i => i.done)
    await Promise.all(done.map(i => api.delete(`/api/shopping/${i.id}`)))
    setItems(prev => prev.filter(i => !i.done))
  }

  const quickAdd = async (suggestion) => {
    const res = await api.post('/api/shopping/', {
      name: suggestion.name,
      category: suggestion.category,
      quantity: 1,
    })
    setItems(prev => [...prev, res.data.item])
  }

  const visible = items.filter(i =>
    filter === 'all' ? true : filter === 'pending' ? !i.done : i.done
  )

  // Merge ירקות and פירות into one group for display
  const grouped = groupByAisle(visible)
  const doneCount    = items.filter(i => i.done).length
  const pendingCount = items.length - doneCount

  // Frequent chips: items not currently on the list
  const currentNames = new Set(items.map(i => i.name.trim().toLowerCase()))
  const frequentChips = frequent
    .filter(f => !currentNames.has(f.name.trim().toLowerCase()))
    .slice(0, 12)

  return (
    <div className="min-h-screen bg-[#f0f4f8] dark:bg-gray-900">
      <Header />
      <main className="page-scroll px-4 max-w-lg mx-auto">

        {/* Header row */}
        <div className="flex items-start justify-between pt-2 mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-white">רשימת קניות 🛒</h2>
            <p className="text-gray-400 dark:text-gray-500 text-xs mt-0.5">
              {pendingCount > 0 ? `נשאר לקנות ${pendingCount}` : items.length > 0 ? '🎉 הכל נקנה!' : 'הרשימה ריקה'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {doneCount > 0 && (
              <button onClick={clearDone}
                className="text-sm text-red-500 font-medium px-3 py-1.5 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                נקה ({doneCount})
              </button>
            )}
            <button onClick={() => setShowModal(true)}
              className="bg-blue-600 text-white text-sm font-bold px-4 py-2 rounded-xl active:scale-95 transition-transform shadow-sm">
              + הוסף
            </button>
          </div>
        </div>

        {/* Frequent quick-add carousel */}
        {frequentChips.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-2 font-medium">קנינו בעבר:</p>
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {frequentChips.map(f => (
                <button key={f.name}
                  onClick={() => quickAdd(f)}
                  className="shrink-0 flex items-center gap-1.5 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-gray-700 dark:text-gray-200 text-xs font-semibold px-3 py-2 rounded-full shadow-sm active:scale-95 transition-transform">
                  <span>{getItemEmoji(f.name, f.category)}</span>
                  <span>{f.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-2 mb-5">
          {[['all', 'הכל'], ['pending', '🛒 נותר'], ['done', '✅ נקנה']].map(([v, label]) => (
            <button key={v} onClick={() => setFilter(v)}
              className={`px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${filter === v ? 'bg-blue-600 text-white shadow-sm' : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}>
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><span className="text-3xl animate-pulse">🛒</span></div>
        ) : visible.length === 0 ? (
          <EmptyState filter={filter} onAdd={() => setShowModal(true)} />
        ) : (
          <div className="space-y-5 pb-24">
            {grouped.map(({ aisle, label, emoji, items: aisleItems }) => (
              <section key={aisle}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-base">{emoji}</span>
                  <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400">{label}</h3>
                  <span className="text-xs text-gray-400">({aisleItems.length})</span>
                </div>
                <div className="space-y-2">
                  {aisleItems.map(item => (
                    <SwipeableItem key={item.id} item={item}
                      onToggle={() => toggle(item)}
                      onDelete={() => remove(item.id)}
                      onAdjustQty={(d) => adjustQty(item.id, d)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      {showModal && (
        <AddItemModal
          onClose={() => setShowModal(false)}
          onSaved={(item) => { setShowModal(false); setItems(prev => [...prev, item]) }}
        />
      )}

      <BottomNav />
    </div>
  )
}

// ── Swipeable Item ─────────────────────────────────────────────────────────────
function SwipeableItem({ item, onToggle, onDelete, onAdjustQty }) {
  const [dx, setDx]         = useState(0)
  const [swiping, setSwiping] = useState(false)
  const startX = useRef(null)
  const THRESHOLD = 72

  const onTouchStart = (e) => { startX.current = e.touches[0].clientX; setSwiping(true) }
  const onTouchMove  = (e) => {
    if (startX.current === null) return
    const d = e.touches[0].clientX - startX.current
    setDx(Math.max(-THRESHOLD - 20, Math.min(THRESHOLD + 20, d)))
  }
  const onTouchEnd   = () => {
    if (dx > THRESHOLD)        { onToggle(); reset() }
    else if (dx < -THRESHOLD)  { onDelete(); reset() }
    else                       reset()
  }
  const reset = () => { setDx(0); setSwiping(false); startX.current = null }

  const revealRight = dx > 0
  const revealLeft  = dx < 0
  const pct = Math.min(Math.abs(dx) / THRESHOLD, 1)

  return (
    <div className="relative rounded-2xl overflow-hidden">
      {/* Right reveal: done */}
      <div className={`absolute inset-0 rounded-2xl flex items-center pr-4 transition-opacity ${revealRight ? 'opacity-100' : 'opacity-0'}`}
        style={{ background: `rgba(34,197,94,${pct * 0.85})` }}>
        <span className="text-white text-xl font-bold">✓ נקנה</span>
      </div>
      {/* Left reveal: delete */}
      <div className={`absolute inset-0 rounded-2xl flex items-center justify-end pl-4 transition-opacity ${revealLeft ? 'opacity-100' : 'opacity-0'}`}
        style={{ background: `rgba(239,68,68,${pct * 0.85})` }}>
        <span className="text-white text-xl font-bold">מחק 🗑️</span>
      </div>

      {/* Card */}
      <div
        className={`relative bg-white dark:bg-gray-800 rounded-2xl shadow-sm touch-pan-y select-none transition-opacity ${item.done ? 'opacity-60' : ''}`}
        style={{ transform: `translateX(${dx}px)`, transition: swiping ? 'none' : 'transform 0.25s ease' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="flex items-center gap-3 px-4 py-3">
          {/* Done toggle */}
          <button onClick={onToggle}
            className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 transition-all active:scale-90 ${item.done ? 'bg-green-500 border-green-500' : 'border-gray-300 dark:border-gray-600 hover:border-green-400'}`}>
            {item.done && <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
          </button>

          <span className="text-xl shrink-0">{getItemEmoji(item.name, item.category)}</span>

          <div className="min-w-0 flex-1">
            <p className={`font-semibold text-sm leading-tight ${item.done ? 'line-through text-gray-400' : 'text-gray-800 dark:text-white'}`}>
              {item.name}
            </p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {item.note && (
                <span className="text-[10px] text-gray-400 dark:text-gray-500 italic">{item.note}</span>
              )}
              {item.added_by && item.added_by.length < 20 && (
                <span className="text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded-full">
                  ✏️ {item.added_by}
                </span>
              )}
            </div>
          </div>

          {/* Quantity stepper */}
          {!item.done && (
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => onAdjustQty(-1)}
                className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex items-center justify-center text-sm font-bold active:scale-90 transition-transform leading-none">
                −
              </button>
              <span className="w-5 text-center text-sm font-bold text-gray-800 dark:text-white tabular-nums">
                {item.quantity}
              </span>
              <button onClick={() => onAdjustQty(+1)}
                className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex items-center justify-center text-sm font-bold active:scale-90 transition-transform leading-none">
                +
              </button>
            </div>
          )}

          {/* Delete */}
          <button onClick={onDelete} className="text-gray-300 dark:text-gray-600 hover:text-red-400 transition-colors p-1 shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Add Item Modal with SmartCombobox ──────────────────────────────────────────
function AddItemModal({ onClose, onSaved }) {
  const [form, setForm]       = useState({ name: '', quantity: 1, unit: '', category: 'אחר', note: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [activeIdx, setActiveIdx]     = useState(-1)
  const [showDrop, setShowDrop]       = useState(false)
  const [showNote, setShowNote]       = useState(false)
  const debounceRef = useRef(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const onNameChange = (e) => {
    const val = e.target.value
    set('name', val)
    setActiveIdx(-1)
    clearTimeout(debounceRef.current)
    if (!val.trim()) { setSuggestions([]); setShowDrop(false); return }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.get(`/api/shopping/suggestions?q=${encodeURIComponent(val.trim())}`)
        const s = res.data.suggestions || []
        setSuggestions(s); setShowDrop(s.length > 0)
      } catch { setSuggestions([]); setShowDrop(false) }
    }, 220)
  }

  const pick = (s) => {
    set('name', s.name)
    if (s.category) set('category', s.category)
    setSuggestions([]); setShowDrop(false); setActiveIdx(-1)
  }

  const onKeyDown = (e) => {
    if (!showDrop) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, suggestions.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, -1)) }
    else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); pick(suggestions[activeIdx]) }
    else if (e.key === 'Escape') { setShowDrop(false); setActiveIdx(-1) }
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setError(''); setLoading(true); setShowDrop(false)
    try {
      const res = await api.post('/api/shopping/', form)
      onSaved(res.data.item)
    } catch (err) {
      setError(err.response?.data?.message || 'שגיאה')
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-800 rounded-t-3xl p-5 pb-10">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white">הוספת פריט</h3>
          <button onClick={onClose} className="text-gray-400 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {error && <p className="text-red-500 text-sm text-center">{error}</p>}

          {/* Smart combobox */}
          <div>
            <label className="block text-gray-600 dark:text-gray-300 text-sm font-medium mb-1.5">שם המוצר</label>
            <div className="relative">
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xl pointer-events-none">
                {getItemEmoji(form.name, form.category)}
              </div>
              <input
                required autoFocus
                value={form.name}
                onChange={onNameChange}
                onKeyDown={onKeyDown}
                onBlur={() => setTimeout(() => setShowDrop(false), 150)}
                onFocus={() => suggestions.length > 0 && setShowDrop(true)}
                placeholder="התחל להקליד..."
                autoComplete="off"
                className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-xl pr-10 pl-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              {showDrop && (
                <ul className="absolute right-0 left-0 top-full mt-1.5 z-50 bg-white dark:bg-gray-700 border border-gray-100 dark:border-gray-600 rounded-xl shadow-xl overflow-hidden max-h-56 overflow-y-auto">
                  {suggestions.map((s, i) => (
                    <li key={s.name}
                      onMouseDown={() => pick(s)}
                      className={`px-4 py-2.5 text-sm cursor-pointer flex items-center gap-2.5 transition-colors ${i === activeIdx ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600'}`}>
                      <span className="text-lg w-6 text-center">{getItemEmoji(s.name, s.category)}</span>
                      <span className="flex-1">{s.name}</span>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500">{CATEGORY_LABEL[s.category] || s.category}</span>
                      {s.family && <span className="text-[10px] text-blue-400 font-bold">⭐</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Quantity + Unit row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-600 dark:text-gray-300 text-sm font-medium mb-1.5">כמות</label>
              <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2">
                <button type="button" onClick={() => set('quantity', Math.max(1, form.quantity - 1))}
                  className="w-7 h-7 rounded-full bg-white dark:bg-gray-600 shadow-sm flex items-center justify-center text-gray-600 dark:text-gray-200 font-bold text-base active:scale-90 transition-transform">−</button>
                <span className="flex-1 text-center font-bold text-gray-800 dark:text-white tabular-nums">{form.quantity}</span>
                <button type="button" onClick={() => set('quantity', form.quantity + 1)}
                  className="w-7 h-7 rounded-full bg-white dark:bg-gray-600 shadow-sm flex items-center justify-center text-gray-600 dark:text-gray-200 font-bold text-base active:scale-90 transition-transform">+</button>
              </div>
            </div>
            <div>
              <label className="block text-gray-600 dark:text-gray-300 text-sm font-medium mb-1.5">קטגוריה</label>
              <select value={form.category} onChange={e => set('category', e.target.value)}
                className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Note toggle */}
          <button type="button" onClick={() => setShowNote(v => !v)}
            className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-blue-500 transition-colors">
            <svg className={`w-3.5 h-3.5 transition-transform ${showNote ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            הוסף הערה (אופציונלי)
          </button>
          {showNote && (
            <input value={form.note} onChange={e => set('note', e.target.value)}
              placeholder='למשל: "רק הירוקים", "ללא סוכר"...'
              maxLength={100}
              className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          )}

          <button type="submit" disabled={loading || !form.name.trim()}
            className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-2xl active:scale-95 transition-transform disabled:opacity-50 text-base mt-1">
            {loading ? 'מוסיף...' : `הוסף ${getItemEmoji(form.name, form.category)} לרשימה`}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const AISLE_ORDER = [
  { aisle: 'produce',  cats: ['ירקות', 'פירות'], label: 'ירקות ופירות',    emoji: '🥦' },
  { aisle: 'מזון',     cats: ['מזון'],            label: 'מזון',             emoji: '🥫' },
  { aisle: 'ניקיון',   cats: ['ניקיון'],          label: 'ניקיון',           emoji: '🧹' },
  { aisle: 'פארם',     cats: ['פארם'],            label: 'פארם וטיפוח',      emoji: '💊' },
  { aisle: 'תינוקות',  cats: ['תינוקות'],         label: 'תינוקות',          emoji: '🍼' },
  { aisle: 'אחר',      cats: ['אחר'],             label: 'שונות',            emoji: '🛒' },
]

function groupByAisle(items) {
  const map = {}
  for (const item of items) {
    const cat = item.category || 'אחר'
    const row = AISLE_ORDER.find(r => r.cats.includes(cat)) || AISLE_ORDER[AISLE_ORDER.length - 1]
    if (!map[row.aisle]) map[row.aisle] = { ...row, items: [] }
    map[row.aisle].items.push(item)
  }
  return AISLE_ORDER.filter(r => map[r.aisle]).map(r => map[r.aisle])
}

function EmptyState({ filter, onAdd }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <span className="text-5xl">{filter === 'done' ? '🎉' : '🛒'}</span>
      <p className="text-gray-500 dark:text-gray-400 font-medium">
        {filter === 'done' ? 'עוד לא נקנה כלום' : filter === 'pending' ? 'הכל נקנה!' : 'הרשימה ריקה'}
      </p>
      {filter !== 'done' && (
        <button onClick={onAdd}
          className="bg-blue-600 text-white text-sm font-bold px-5 py-2.5 rounded-xl active:scale-95 transition-transform">
          הוסף פריט
        </button>
      )}
    </div>
  )
}
