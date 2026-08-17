import { useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import Header from '../components/layout/Header'
import BottomNav from '../components/layout/BottomNav'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'

// ─── Config ───────────────────────────────────────────────────────────────────
const TYPE_META = {
  general:  { label: 'כללי',      emoji: '📅', dot: '#3b82f6', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',     bg: 'bg-blue-50 dark:bg-blue-900/20'   },
  birthday: { label: 'יום הולדת', emoji: '🎂', dot: '#ec4899', badge: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',     bg: 'bg-pink-50 dark:bg-pink-900/20'   },
  medical:  { label: 'רפואי',     emoji: '🏥', dot: '#ef4444', badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',         bg: 'bg-red-50 dark:bg-red-900/20'     },
  school:   { label: 'לימודים',   emoji: '🎓', dot: '#8b5cf6', badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300', bg: 'bg-purple-50 dark:bg-purple-900/20' },
  sport:    { label: 'ספורט',     emoji: '⚽', dot: '#10b981', badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300', bg: 'bg-green-50 dark:bg-green-900/20' },
  trip:     { label: 'טיול',      emoji: '✈️', dot: '#f59e0b', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', bg: 'bg-amber-50 dark:bg-amber-900/20' },
}
const TYPES    = Object.entries(TYPE_META).map(([value, m]) => ({ value, label: m.label, emoji: m.emoji }))
const EMOJIS   = ['📅','🎂','🏥','✈️','🎓','⚽','🎉','🎭','💼','🎵','🍕','🏖️','🎪','🎨','🏋️']
const DAY_HEB  = ['א','ב','ג','ד','ה','ו','ש']
const MONTHS   = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר']

const todayISO  = () => new Date().toISOString().slice(0, 10)
const toISO     = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

function formatFull(iso) {
  if (!iso) return ''
  return new Date(iso + 'T00:00:00').toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })
}
function formatShort(iso) {
  if (!iso) return ''
  return new Date(iso + 'T00:00:00').toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'short' })
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Calendar() {
  const { user }   = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const now = new Date()
  const [viewYear,  setViewYear]  = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth())
  const [selected,  setSelected]  = useState(todayISO())
  const [events,    setEvents]    = useState([])
  const [loading,   setLoading]   = useState(true)
  const [sheet,     setSheet]     = useState(null) // null | 'add' | eventObj

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setSheet('add')
      setSearchParams({}, { replace: true })
    }
  }, [])

  const load = async () => {
    setLoading(true)
    try { const r = await api.get('/api/events/'); setEvents(r.data.events) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const remove = async (id) => {
    await api.delete(`/api/events/${id}`)
    setEvents(ev => ev.filter(e => e.id !== id))
  }

  // Index events by date
  const byDate = useMemo(() => {
    const m = {}
    for (const ev of events) { if (!m[ev.date]) m[ev.date] = []; m[ev.date].push(ev) }
    return m
  }, [events])

  // Month grid cells
  const grid = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1)
    const days  = new Date(viewYear, viewMonth + 1, 0).getDate()
    const cells = Array(first.getDay()).fill(null)
    for (let d = 1; d <= days; d++) cells.push(d)
    return cells
  }, [viewYear, viewMonth])

  const today = todayISO()

  const prevMonth = () => viewMonth === 0  ? (setViewYear(y => y - 1), setViewMonth(11)) : setViewMonth(m => m - 1)
  const nextMonth = () => viewMonth === 11 ? (setViewYear(y => y + 1), setViewMonth(0))  : setViewMonth(m => m + 1)
  const goToday   = () => { setViewYear(now.getFullYear()); setViewMonth(now.getMonth()); setSelected(today) }

  const selectedEvents = selected ? (byDate[selected] || []) : []
  const upcoming = useMemo(() =>
    events.filter(e => e.date >= today).sort((a, b) => a.date > b.date ? 1 : -1).slice(0, 12),
    [events, today])

  const listTitle  = selected === today ? 'היום' : selected ? formatFull(selected) : 'אירועים קרובים'
  const listEvents = selected ? selectedEvents : upcoming

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900" dir="rtl">
      <Header />
      <main className="page-scroll px-3 pt-2 max-w-lg mx-auto pb-28">

        {/* ── Calendar card ─────────────────────────────────────────────── */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm overflow-hidden mb-3">

          {/* Month nav */}
          <div className="flex items-center justify-between px-5 pt-5 pb-2">
            <button onClick={prevMonth}
              className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center active:scale-90 transition-transform">
              <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="text-center">
              <p className="text-lg font-extrabold text-gray-800 dark:text-white">{MONTHS[viewMonth]}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 -mt-0.5">{viewYear}</p>
            </div>
            <button onClick={nextMonth}
              className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center active:scale-90 transition-transform">
              <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 px-3 mb-1">
            {DAY_HEB.map(d => (
              <div key={d} className="text-center text-[11px] font-bold text-gray-300 dark:text-gray-600 py-1">{d}</div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 px-3 pb-4 gap-y-0.5">
            {grid.map((day, i) => {
              if (!day) return <div key={`e${i}`} className="h-11" />
              const iso      = toISO(viewYear, viewMonth, day)
              const isToday  = iso === today
              const isSel    = iso === selected
              const dots     = (byDate[iso] || []).slice(0, 3)

              return (
                <button key={iso} onClick={() => setSelected(isSel ? null : iso)}
                  className="flex flex-col items-center justify-center h-11 gap-0.5 rounded-xl transition-all active:scale-90">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all
                    ${isSel   ? 'bg-blue-600 text-white shadow-lg shadow-blue-300/40 dark:shadow-blue-900/60 scale-105'
                    : isToday ? 'ring-2 ring-blue-500 text-blue-600 dark:text-blue-400'
                    :           'text-gray-700 dark:text-gray-300'}`}>
                    {day}
                  </div>
                  <div className="flex gap-0.5 h-1.5 items-center">
                    {dots.map((ev, di) => (
                      <div key={di} className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: (TYPE_META[ev.type] || TYPE_META.general).dot }} />
                    ))}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Action row ───────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 mb-4">
          {selected !== today && (
            <button onClick={goToday}
              className="flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-xl active:scale-95 transition-transform border border-blue-100 dark:border-blue-800">
              📍 היום
            </button>
          )}
          <div className="flex-1" />
          <button onClick={() => setSheet('add')}
            className="flex items-center gap-1.5 bg-blue-600 text-white text-sm font-bold px-4 py-2.5 rounded-xl active:scale-95 transition-transform shadow-sm shadow-blue-200 dark:shadow-blue-900">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            אירוע חדש
          </button>
        </div>

        {/* ── Event list ───────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-sm font-bold text-gray-800 dark:text-white">{listTitle}</p>
          {selected && listEvents.length > 0 && (
            <span className="text-xs text-gray-400">{listEvents.length} אירועים</span>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-14">
            <div className="w-8 h-8 border-[3px] border-blue-100 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : listEvents.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-10 text-center shadow-sm">
            <p className="text-4xl mb-2">📭</p>
            <p className="text-gray-400 text-sm mb-3">
              {selected === today ? 'אין אירועים היום' : selected ? 'אין אירועים ביום זה' : 'אין אירועים קרובים'}
            </p>
            <button onClick={() => setSheet('add')}
              className="text-blue-600 dark:text-blue-400 text-sm font-semibold">
              + הוסף אירוע
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {listEvents.map(ev => (
              <EventCard key={ev.id} event={ev} user={user}
                onEdit={() => setSheet(ev)}
                onDelete={() => remove(ev.id)} />
            ))}
          </div>
        )}
      </main>

      {/* ── Bottom sheet ─────────────────────────────────────────────── */}
      {sheet && (
        <EventSheet
          initial={sheet === 'add' ? null : sheet}
          defaultDate={selected || today}
          onClose={() => setSheet(null)}
          onSaved={(ev, isEdit) => {
            if (isEdit) {
              setEvents(prev => prev.map(e => e.id === ev.id ? ev : e))
            } else {
              setEvents(prev => [...prev, ev].sort((a, b) => a.date > b.date ? 1 : -1))
              const d = new Date(ev.date + 'T00:00:00')
              setViewYear(d.getFullYear()); setViewMonth(d.getMonth())
              setSelected(ev.date)
            }
            setSheet(null)
          }}
        />
      )}

      <BottomNav />
    </div>
  )
}

// ─── Event Card ───────────────────────────────────────────────────────────────
function EventCard({ event, user, onEdit, onDelete }) {
  const [confirming, setConfirming] = useState(false)
  const canEdit  = user?.role === 'admin' || user?.role === 'parent' || event.created_by === user?.id
  const isPast   = event.date < todayISO()
  const isToday  = event.date === todayISO()
  const meta     = TYPE_META[event.type] || TYPE_META.general

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden transition-opacity ${isPast && !isToday ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-3 px-4 py-3.5">
        {/* Left color bar */}
        <div className="w-1 self-stretch rounded-full shrink-0" style={{ backgroundColor: meta.dot }} />

        {/* Emoji */}
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 ${meta.bg}`}>
          {event.emoji}
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-800 dark:text-white text-sm leading-snug truncate">{event.title}</p>
          <div className="flex items-center gap-1 flex-wrap mt-0.5">
            {isToday && <span className="text-[10px] font-bold text-blue-500">היום ·</span>}
            <span className="text-[11px] text-gray-400 dark:text-gray-500">{formatShort(event.date)}</span>
            {event.time     && <span className="text-[11px] text-gray-400">· {event.time}</span>}
            {event.location && <span className="text-[11px] text-gray-400 truncate">· 📍 {event.location}</span>}
          </div>
          <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full mt-1 ${meta.badge}`}>
            {meta.label}
          </span>
        </div>

        {/* Actions */}
        {canEdit && (
          confirming ? (
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={() => setConfirming(false)}
                className="text-xs text-gray-400 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                ביטול
              </button>
              <button onClick={onDelete}
                className="text-xs font-bold text-red-500 bg-red-50 dark:bg-red-900/20 px-2.5 py-1.5 rounded-lg">
                מחק
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-0.5 shrink-0">
              <button onClick={onEdit}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-300 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
              <button onClick={() => setConfirming(true)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          )
        )}
      </div>
    </div>
  )
}

// ─── Event Sheet ──────────────────────────────────────────────────────────────
function EventSheet({ initial, defaultDate, onClose, onSaved }) {
  const [form, setForm] = useState(initial
    ? { title: initial.title, date: initial.date, time: initial.time || '', location: initial.location || '', emoji: initial.emoji || '📅', type: initial.type || 'general' }
    : { title: '', date: defaultDate, time: '', location: '', emoji: '📅', type: 'general' })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const pickType = (value) => {
    set('type', value)
    set('emoji', (TYPE_META[value] || TYPE_META.general).emoji)
  }

  const submit = async () => {
    setError('')
    if (!form.title.trim()) return setError('הכנס כותרת')
    if (!form.date)         return setError('בחר תאריך')
    setLoading(true)
    try {
      const res = initial
        ? await api.patch(`/api/events/${initial.id}`, form)
        : await api.post('/api/events/', form)
      onSaved(res.data.event, !!initial)
    } catch (e) {
      setError(e.response?.data?.message || 'שגיאה, נסה שוב')
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" dir="rtl">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-t-3xl w-full max-w-lg shadow-2xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-gray-100 dark:border-gray-700 shrink-0">
          <div className="w-10 h-1 bg-gray-200 dark:bg-gray-600 rounded-full mx-auto mb-3" />
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-gray-800 dark:text-white">
              {initial ? 'עריכת אירוע' : 'אירוע חדש'}
            </h3>
            <button onClick={onClose}
              className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
              <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {/* Type chips */}
          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 block mb-2">סוג</label>
            <div className="flex gap-2 flex-wrap">
              {TYPES.map(t => {
                const m      = TYPE_META[t.value]
                const active = form.type === t.value
                return (
                  <button key={t.value} type="button" onClick={() => pickType(t.value)}
                    className={`flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full transition-all active:scale-95 border
                      ${active ? m.badge + ' border-current' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-transparent'}`}>
                    {t.emoji} {t.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 block mb-1.5">כותרת *</label>
            <input autoFocus value={form.title} onChange={e => set('title', e.target.value)}
              placeholder="שם האירוע"
              className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 text-right" />
          </div>

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 block mb-1.5">תאריך *</label>
              <input type="date" value={form.date} onChange={e => set('date', e.target.value)}
                className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-3 text-sm text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 block mb-1.5">שעה</label>
              <input type="time" value={form.time} onChange={e => set('time', e.target.value)}
                className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-3 text-sm text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 block mb-1.5">מיקום</label>
            <input value={form.location} onChange={e => set('location', e.target.value)}
              placeholder="כתובת / שם מקום (אופציונלי)"
              className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 text-right" />
          </div>

          {/* Emoji picker */}
          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 block mb-2">אייקון</label>
            <div className="flex flex-wrap gap-2">
              {EMOJIS.map(em => (
                <button key={em} type="button" onClick={() => set('emoji', em)}
                  className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-all active:scale-90
                    ${form.emoji === em
                      ? 'bg-blue-100 dark:bg-blue-900/40 ring-2 ring-blue-400 scale-110'
                      : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
                  {em}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-2.5 text-red-600 dark:text-red-400 text-sm text-center">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-8 pt-3 border-t border-gray-100 dark:border-gray-700 shrink-0">
          <button onClick={submit} disabled={loading || !form.title.trim() || !form.date}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold py-3.5 rounded-2xl text-sm transition-colors active:scale-95 transform">
            {loading
              ? <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  שומר...
                </span>
              : initial ? 'שמור שינויים' : 'הוסף ליומן'}
          </button>
        </div>
      </div>
    </div>
  )
}
