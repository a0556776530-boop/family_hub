import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { io } from 'socket.io-client'
import Header from '../components/layout/Header'
import BottomNav from '../components/layout/BottomNav'
import FAB from '../components/layout/FAB'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useFamily } from '../context/FamilyContext'
import { useConfetti } from '../components/Confetti'

const PRIORITIES  = ['low', 'medium', 'high']
const PRIORITY_LABEL = { high: 'גבוהה', medium: 'בינונית', low: 'נמוכה' }
const PRIORITY_COLOR = {
  high:   'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
  medium: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400',
  low:    'bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400',
}
const CATEGORIES = ['ניקיון', 'מטבח', 'לימודים', 'סידורים', 'קניות', 'תחזוקת הבית', 'אחר']

export default function Tasks() {
  const { user, refreshUser } = useAuth()
  const { family }            = useFamily()
  const confetti              = useConfetti()
  const [searchParams, setSearchParams] = useSearchParams()

  const isParent = user?.role === 'parent'

  const [tasks, setTasks]     = useState([])
  const [filter, setFilter]   = useState('pending')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(searchParams.get('new') === '1')
  const [toast, setToast]     = useState(null)

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowModal(true)
      setSearchParams({}, { replace: true })
    }
  }, [])

  // ── SocketIO ─────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.family_id) return
    const socket = io(import.meta.env.VITE_API_URL || 'http://localhost:5000', { transports: ['websocket'] })
    socket.emit('join_family', { family_id: user.family_id })

    socket.on('task_created', task => {
      if (filter === 'pending') setTasks(prev => [task, ...prev])
    })
    socket.on('task_updated', task => {
      setTasks(prev => prev.map(t => t.id === task.id ? task : t).filter(t => t.status === filter || (filter === 'awaiting_approval' && t.status === 'awaiting_approval')))
      load()
    })
    socket.on('task_approved', ({ task, xp_earned, completer_id }) => {
      if (completer_id === user.id) {
        showToast(`🎉 +${xp_earned} XP נוסף לארנק שלך!`)
        confetti()
      } else {
        showToast('✅ משימה אושרה!')
      }
      refreshUser()
      load()
    })
    socket.on('task_deleted', ({ id }) => setTasks(prev => prev.filter(t => t.id !== id)))

    return () => socket.disconnect()
  }, [user?.family_id, filter])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get(`/api/tasks/?status=${filter}`)
      setTasks(res.data.tasks)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { load() }, [load])

  const complete = async (task) => {
    try {
      const res = await api.patch(`/api/tasks/${task.id}/complete`)
      showToast(res.data.awaiting ? '⏳ נשלח לאישור הורה!' : `🎉 +${res.data.xp_earned} XP!`)
      if (!res.data.awaiting) { refreshUser(); confetti() }
      load()
    } catch (err) {
      showToast(err.response?.data?.message || 'שגיאה')
    }
  }

  const approve = async (task) => {
    try {
      const res = await api.patch(`/api/tasks/${task.id}/approve`)
      showToast(res.data.message)
      confetti()
      refreshUser()
      load()
    } catch (err) {
      showToast(err.response?.data?.message || 'שגיאה')
    }
  }

  const remove = async (task) => {
    await api.delete(`/api/tasks/${task.id}`)
    setTasks(t => t.filter(x => x.id !== task.id))
  }

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  const filterTabs = [
    ['pending', '📋 פתוחות'],
    ['awaiting_approval', '⏳ לאישור'],
    ['done', '✅ הושלמו'],
  ]

  return (
    <div className="min-h-screen bg-[#f0f4f8] dark:bg-gray-900">
      <Header />
      <main className="page-scroll px-4 max-w-lg mx-auto">

        <div className="flex items-center justify-between pt-2 mb-4">
          <h2 className="text-xl font-bold text-gray-800 dark:text-white">משימות</h2>
          {isParent && (
            <button onClick={() => setShowModal(true)}
              className="bg-blue-600 text-white text-sm font-bold px-4 py-2 rounded-xl active:scale-95 transition-transform shadow-sm">
              + חדש
            </button>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-5 overflow-x-auto no-scrollbar">
          {filterTabs.map(([v, label]) => (
            <button key={v} onClick={() => setFilter(v)}
              className={`px-3 py-2 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap ${filter === v ? 'bg-blue-600 text-white shadow-sm' : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}>
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><span className="text-3xl animate-pulse">📋</span></div>
        ) : tasks.length === 0 ? (
          <Empty filter={filter} isParent={isParent} onAdd={() => setShowModal(true)} />
        ) : (
          <div className="space-y-3 pb-24">
            {tasks.map(t => (
              <TaskCard key={t.id} task={t} user={user} family={family} isParent={isParent}
                onComplete={() => complete(t)}
                onApprove={() => approve(t)}
                onDelete={() => remove(t)} />
            ))}
          </div>
        )}
      </main>

      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-gray-900 dark:bg-white dark:text-gray-900 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl">
          {toast}
        </div>
      )}

      {showModal && (
        <AddTaskModal
          family={family}
          onClose={() => setShowModal(false)}
          onSaved={(t) => { setShowModal(false); if (filter === 'pending') setTasks(prev => [t, ...prev]) }}
        />
      )}

      <BottomNav />
      <FAB />
    </div>
  )
}

function TaskCard({ task, user, family, isParent, onComplete, onApprove, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const member   = family?.members?.find(m => m.id === task.assigned_to)
  const canDelete = isParent || task.created_by === user?.id
  const isAwaiting = task.status === 'awaiting_approval'
  const isDone     = task.status === 'done'
  const isPending  = task.status === 'pending'

  const statusBadge = isAwaiting
    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
    : isDone
    ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
    : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'

  const statusLabel = isAwaiting ? 'ממתין' : isDone ? 'הושלם' : 'פתוח'

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-3">
        {/* Action button */}
        {isPending && (
          <button onClick={onComplete}
            className="w-7 h-7 rounded-full border-2 border-blue-400 flex items-center justify-center shrink-0 active:scale-90 transition-transform hover:bg-blue-50 dark:hover:bg-blue-900/30">
            <svg className="w-3.5 h-3.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </button>
        )}
        {isAwaiting && isParent && (
          <button onClick={onApprove}
            className="w-7 h-7 rounded-full bg-amber-400 flex items-center justify-center shrink-0 active:scale-90 transition-transform shadow-sm">
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </button>
        )}
        {isAwaiting && !isParent && (
          <div className="w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0 text-sm">⏳</div>
        )}
        {isDone && (
          <div className="w-7 h-7 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center shrink-0 text-base">✅</div>
        )}

        <div className="min-w-0 flex-1" onClick={() => setExpanded(e => !e)}>
          <p className={`font-semibold text-sm truncate ${isDone ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-white'}`}>
            {task.title}
          </p>
          <p className="text-gray-400 dark:text-gray-500 text-xs">
            {task.category}
            {member ? ` · ${member.name?.split(' ')[0]}` : ''}
            {` · ${task.xp_value} XP`}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusBadge}`}>{statusLabel}</span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${PRIORITY_COLOR[task.priority]}`}>
            {PRIORITY_LABEL[task.priority]}
          </span>
        </div>

        {canDelete && (
          <button onClick={onDelete} className="text-gray-300 dark:text-gray-600 hover:text-red-400 transition-colors p-1 shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>

      {expanded && task.description && (
        <div className="px-4 pb-3 text-gray-500 dark:text-gray-400 text-sm border-t border-gray-50 dark:border-gray-700 pt-2">
          {task.description}
        </div>
      )}
    </div>
  )
}

function AddTaskModal({ family, onClose, onSaved }) {
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', category: 'אחר', assigned_to: '', xp_value: 10 })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const payload = { ...form, assigned_to: form.assigned_to || undefined }
      const res = await api.post('/api/tasks/', payload)
      onSaved(res.data.task)
    } catch (err) {
      setError(err.response?.data?.message || 'שגיאה')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title="משימה חדשה" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {error && <p className="text-red-500 text-sm text-center">{error}</p>}

        <Field label="כותרת">
          <input required value={form.title} onChange={e => set('title', e.target.value)}
            placeholder="תוכן המשימה" className="modal-input dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
        </Field>

        <Field label="תיאור (אופציונלי)">
          <textarea value={form.description} onChange={e => set('description', e.target.value)}
            rows={2} placeholder="פרטים נוספים..."
            className="modal-input resize-none dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="קטגוריה">
            <select value={form.category} onChange={e => set('category', e.target.value)}
              className="modal-input dark:bg-gray-700 dark:border-gray-600 dark:text-white">
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="עדיפות">
            <select value={form.priority} onChange={e => set('priority', e.target.value)}
              className="modal-input dark:bg-gray-700 dark:border-gray-600 dark:text-white">
              {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="הקצה ל">
            <select value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)}
              className="modal-input dark:bg-gray-700 dark:border-gray-600 dark:text-white">
              <option value="">כולם</option>
              {family?.members?.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Field>
          <Field label={`XP: ${form.xp_value}`}>
            <input type="range" min={1} max={100} value={form.xp_value}
              onChange={e => set('xp_value', +e.target.value)} className="w-full mt-2" />
          </Field>
        </div>

        <button type="submit" disabled={loading}
          className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl active:scale-95 transition-transform disabled:opacity-60">
          {loading ? 'שומר...' : 'הוסף משימה'}
        </button>
      </form>
    </Modal>
  )
}

function Empty({ filter, isParent, onAdd }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <span className="text-5xl">{filter === 'done' ? '🏆' : filter === 'awaiting_approval' ? '⏳' : '🎉'}</span>
      <p className="text-gray-500 dark:text-gray-400 font-medium">
        {filter === 'done' ? 'עוד לא הושלמו משימות' : filter === 'awaiting_approval' ? 'אין משימות ממתינות לאישור' : 'אין משימות פתוחות!'}
      </p>
      {filter === 'pending' && isParent && (
        <button onClick={onAdd} className="bg-blue-600 text-white text-sm font-bold px-5 py-2.5 rounded-xl active:scale-95 transition-transform">
          הוסף משימה
        </button>
      )}
    </div>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-800 rounded-t-3xl p-5 pb-8 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1">
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
      <label className="block text-gray-600 dark:text-gray-300 text-sm font-medium mb-1.5">{label}</label>
      {children}
    </div>
  )
}
