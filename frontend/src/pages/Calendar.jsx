import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Header from '../components/layout/Header'
import BottomNav from '../components/layout/BottomNav'
import FAB from '../components/layout/FAB'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'

const EMOJIS = ['📅', '🎂', '🏥', '✈️', '🎓', '⚽', '🎉', '🎭', '🛒', '💼']
const TYPES  = [
  { value: 'general',  label: 'כללי' },
  { value: 'birthday', label: 'יום הולדת' },
  { value: 'medical',  label: 'רפואי' },
  { value: 'school',   label: 'לימודים' },
  { value: 'sport',    label: 'ספורט' },
  { value: 'trip',     label: 'טיול' },
]

export default function Calendar() {
  const { user }   = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const [events, setEvents]   = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(searchParams.get('new') === '1')

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowModal(true)
      setSearchParams({}, { replace: true })
    }
  }, [])

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get('/api/events/')
      setEvents(res.data.events)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const remove = async (id) => {
    await api.delete(`/api/events/${id}`)
    setEvents(ev => ev.filter(e => e.id !== id))
  }

  const grouped = groupByMonth(events)

  return (
    <div className="min-h-screen bg-[#f0f4f8]">
      <Header />
      <main className="page-scroll px-4 max-w-lg mx-auto">

        <div className="flex items-center justify-between pt-2 mb-5">
          <h2 className="text-xl font-bold text-gray-800">יומן משפחתי</h2>
          <button onClick={() => setShowModal(true)}
            className="bg-blue-600 text-white text-sm font-bold px-4 py-2 rounded-xl active:scale-95 transition-transform shadow-sm">
            + חדש
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><span className="text-3xl animate-pulse">📅</span></div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <span className="text-5xl">📅</span>
            <p className="text-gray-500 font-medium">אין אירועים מתוכננים</p>
            <button onClick={() => setShowModal(true)}
              className="bg-blue-600 text-white text-sm font-bold px-5 py-2.5 rounded-xl active:scale-95 transition-transform">
              הוסף אירוע
            </button>
          </div>
        ) : (
          <div className="space-y-6 pb-24">
            {grouped.map(({ month, items }) => (
              <div key={month}>
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wide mb-3">{month}</h3>
                <div className="space-y-2">
                  {items.map(ev => (
                    <EventCard key={ev.id} event={ev} user={user} onDelete={() => remove(ev.id)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {showModal && (
        <AddEventModal
          onClose={() => setShowModal(false)}
          onSaved={(ev) => { setShowModal(false); setEvents(prev => [...prev, ev].sort((a, b) => a.date > b.date ? 1 : -1)) }}
        />
      )}

      <BottomNav />
      <FAB />
    </div>
  )
}

function EventCard({ event, user, onDelete }) {
  const canDelete = user?.role === 'admin' || event.created_by === user?.id
  const isPast = event.date < new Date().toISOString().slice(0, 10)

  return (
    <div className={`bg-white rounded-2xl px-4 py-3 shadow-sm flex items-center gap-3 ${isPast ? 'opacity-60' : ''}`}>
      <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center shrink-0 text-xl">
        {event.emoji}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-gray-800 text-sm truncate">{event.title}</p>
        <p className="text-gray-400 text-xs">
          {formatDate(event.date)}{event.time ? ` · ${event.time}` : ''}{event.location ? ` · ${event.location}` : ''}
        </p>
      </div>
      {canDelete && (
        <button onClick={onDelete} className="text-gray-300 hover:text-red-400 transition-colors p-1 shrink-0">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      )}
    </div>
  )
}

function AddEventModal({ onClose, onSaved }) {
  const [form, setForm]     = useState({ title: '', date: '', time: '', location: '', emoji: '📅', type: 'general' })
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.post('/api/events/', form)
      onSaved(res.data.event)
    } catch (err) {
      setError(err.response?.data?.message || 'שגיאה')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title="אירוע חדש" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {error && <p className="text-red-500 text-sm text-center">{error}</p>}

        <Field label="כותרת">
          <input required value={form.title} onChange={e => set('title', e.target.value)}
            placeholder="שם האירוע" className="modal-input" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="תאריך">
            <input required type="date" value={form.date} onChange={e => set('date', e.target.value)} className="modal-input" />
          </Field>
          <Field label="שעה">
            <input type="time" value={form.time} onChange={e => set('time', e.target.value)} className="modal-input" />
          </Field>
        </div>

        <Field label="מיקום (אופציונלי)">
          <input value={form.location} onChange={e => set('location', e.target.value)}
            placeholder="כתובת / שם מקום" className="modal-input" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="סוג">
            <select value={form.type} onChange={e => set('type', e.target.value)} className="modal-input">
              {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="אמוג'י">
            <div className="flex flex-wrap gap-1.5 mt-1">
              {EMOJIS.map(em => (
                <button key={em} type="button" onClick={() => set('emoji', em)}
                  className={`text-xl p-1 rounded-lg transition-colors ${form.emoji === em ? 'bg-blue-100 ring-2 ring-blue-400' : 'hover:bg-gray-100'}`}>
                  {em}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <button type="submit" disabled={loading}
          className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl active:scale-95 transition-transform disabled:opacity-60">
          {loading ? 'שומר...' : 'הוסף אירוע'}
        </button>
      </form>
    </Modal>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl p-5 pb-8 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-gray-600 text-sm font-medium mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'long' })
}

function groupByMonth(events) {
  const map = {}
  for (const ev of events) {
    const d = new Date((ev.date || '') + 'T00:00:00')
    const key = d.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })
    if (!map[key]) map[key] = []
    map[key].push(ev)
  }
  return Object.entries(map).map(([month, items]) => ({ month, items }))
}
