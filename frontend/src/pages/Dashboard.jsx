import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../components/layout/Header'
import BottomNav from '../components/layout/BottomNav'
import FAB from '../components/layout/FAB'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'

const PRIORITY_COLOR = { high: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400', medium: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400', low: 'bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400' }
const PRIORITY_LABEL = { high: 'גבוהה', medium: 'בינונית', low: 'נמוכה' }

export default function Dashboard() {
  const { user } = useAuth()
  const navigate  = useNavigate()
  const isParent  = user?.role === 'parent'

  const [data, setData]           = useState(null)
  const [tasks, setTasks]         = useState([])
  const [events, setEvents]       = useState([])
  const [awaitingCount, setAwaitingCount] = useState(0)
  const [featuredMoment, setFeaturedMoment] = useState(null)
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    const reqs = [
      api.get('/api/family/dashboard'),
      api.get('/api/tasks/?status=pending'),
      api.get('/api/events/'),
      api.get('/api/moments/').catch(() => ({ data: { moments: [] } })),
    ]
    if (isParent) reqs.push(api.get('/api/tasks/?status=awaiting_approval').catch(() => ({ data: { tasks: [] } })))

    Promise.all(reqs).then(([d, t, e, m, aw]) => {
      setData(d.data)
      setTasks(t.data.tasks.slice(0, 3))
      setEvents(e.data.events.filter(ev => ev.date >= today()).slice(0, 3))
      if (m.data.moments?.length) setFeaturedMoment(m.data.moments[0])
      if (aw) setAwaitingCount(aw.data.tasks.length)
    }).finally(() => setLoading(false))
  }, [isParent])

  if (loading) return <PageLoader />

  const { family, pending_tasks, done_tasks, upcoming_events } = data
  const level  = family.level
  const xpPct  = Math.round((family.xp_current / family.xp_next) * 100)
  const greeting = getGreeting()

  return (
    <div className="min-h-screen bg-[#f0f4f8] dark:bg-gray-900">
      <Header />
      <main className="page-scroll px-4 max-w-lg mx-auto space-y-5 pb-24">

        {/* Greeting */}
        <div className="pt-2">
          <h2 className="text-xl font-bold text-gray-800 dark:text-white">{greeting}, {user?.name?.split(' ')[0]} 👋</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm">הנה מה שקורה היום במשפחת {family.name}</p>
        </div>

        {/* Level card */}
        <div className="bg-gradient-to-l from-blue-700 to-blue-500 dark:from-blue-900 dark:to-blue-700 rounded-2xl p-4 text-white shadow-md">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-blue-100 text-xs font-medium">רמת המשפחה</p>
              <p className="text-2xl font-extrabold">רמה {level} 🏆</p>
            </div>
            <div className="text-right">
              <p className="text-blue-100 text-xs">ניקוד כולל</p>
              <p className="text-xl font-bold">{family.score}</p>
            </div>
          </div>
          <div className="bg-white/20 rounded-full h-2">
            <div className="bg-white rounded-full h-2 transition-all" style={{ width: `${xpPct}%` }} />
          </div>
          <p className="text-blue-100 text-xs mt-1.5">{family.xp_current} / {family.xp_next} XP לרמה הבאה</p>
        </div>

        {/* Parent: awaiting approval banner */}
        {isParent && awaitingCount > 0 && (
          <button onClick={() => navigate('/tasks')}
            className="w-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl px-4 py-3.5 flex items-center gap-3 active:scale-95 transition-transform shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-800/40 flex items-center justify-center text-xl shrink-0">⏳</div>
            <div className="flex-1 text-right">
              <p className="font-bold text-amber-800 dark:text-amber-300 text-sm">ממתין לאישורך</p>
              <p className="text-amber-600 dark:text-amber-400 text-xs">{awaitingCount} משימה{awaitingCount > 1 ? 'ות' : ''} מחכות לאישור</p>
            </div>
            <svg className="w-5 h-5 text-amber-400 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}

        {/* Child: wallet balance card */}
        {!isParent && (
          <button onClick={() => navigate('/rewards')}
            className="w-full bg-gradient-to-l from-violet-600 to-purple-500 dark:from-violet-900 dark:to-purple-800 rounded-2xl px-4 py-3.5 flex items-center gap-3 active:scale-95 transition-transform shadow-md">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-xl shrink-0">💰</div>
            <div className="flex-1 text-right">
              <p className="text-purple-100 text-xs font-medium">הארנק שלי</p>
              <p className="text-white font-extrabold text-xl">{user?.wallet_balance ?? 0} <span className="text-sm font-bold text-purple-200">XP</span></p>
            </div>
            <span className="text-purple-200 text-xs font-semibold">לחנות →</span>
          </button>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'משימות פתוחות', value: pending_tasks, emoji: '📋', onClick: () => navigate('/tasks') },
            { label: 'הושלמו', value: done_tasks, emoji: '✅', onClick: () => navigate('/tasks') },
            { label: 'אירועים קרובים', value: upcoming_events, emoji: '📅', onClick: () => navigate('/calendar') },
          ].map(s => (
            <button key={s.label} onClick={s.onClick}
              className="bg-white dark:bg-gray-800 rounded-2xl p-3 text-center shadow-sm active:scale-95 transition-transform">
              <div className="text-2xl mb-1">{s.emoji}</div>
              <div className="text-2xl font-extrabold text-gray-800 dark:text-white">{s.value}</div>
              <div className="text-gray-500 dark:text-gray-400 text-[10px] leading-tight mt-0.5">{s.label}</div>
            </button>
          ))}
        </div>

        {/* Shortcut grid */}
        <section>
          <h3 className="font-bold text-gray-800 dark:text-white mb-3">קיצורי דרך</h3>
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'יומן', emoji: '📅', to: '/calendar', bg: 'bg-purple-50 dark:bg-purple-900/20' },
              { label: 'קניות', emoji: '🛒', to: '/shopping', bg: 'bg-green-50 dark:bg-green-900/20' },
              { label: 'משפחה', emoji: '👨‍👩‍👧', to: '/family', bg: 'bg-orange-50 dark:bg-orange-900/20' },
              { label: 'רגעים', emoji: '📸', to: '/moments', bg: 'bg-pink-50 dark:bg-pink-900/20' },
            ].map(s => (
              <button key={s.to} onClick={() => navigate(s.to)}
                className={`${s.bg} rounded-2xl p-3 flex flex-col items-center gap-1.5 active:scale-95 transition-transform shadow-sm`}>
                <span className="text-2xl">{s.emoji}</span>
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{s.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Pending tasks */}
        {tasks.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-800 dark:text-white">משימות ממתינות</h3>
              <button onClick={() => navigate('/tasks')} className="text-blue-600 dark:text-blue-400 text-sm font-medium">הכל</button>
            </div>
            <div className="space-y-2">
              {tasks.map(t => (
                <div key={t.id} className="bg-white dark:bg-gray-800 rounded-2xl px-4 py-3 shadow-sm flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0 text-lg">📋</div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-800 dark:text-white text-sm truncate">{t.title}</p>
                    <p className="text-gray-400 text-xs">{t.category}</p>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PRIORITY_COLOR[t.priority]}`}>
                    {PRIORITY_LABEL[t.priority]}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Upcoming events */}
        {events.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-800 dark:text-white">אירועים קרובים</h3>
              <button onClick={() => navigate('/calendar')} className="text-blue-600 dark:text-blue-400 text-sm font-medium">הכל</button>
            </div>
            <div className="space-y-2">
              {events.map(ev => (
                <div key={ev.id} className="bg-white dark:bg-gray-800 rounded-2xl px-4 py-3 shadow-sm flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-900/30 flex items-center justify-center shrink-0 text-lg">{ev.emoji}</div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-800 dark:text-white text-sm truncate">{ev.title}</p>
                    <p className="text-gray-400 text-xs">{formatDate(ev.date)}{ev.time ? ` · ${ev.time}` : ''}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Members */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-800 dark:text-white">חברי המשפחה</h3>
            <button onClick={() => navigate('/family')} className="text-blue-600 dark:text-blue-400 text-sm font-medium">הכל</button>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {family.members.map(m => (
              <div key={m.id} className="flex flex-col items-center gap-1.5 shrink-0">
                <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/40 ring-2 ring-blue-200 dark:ring-blue-700 overflow-hidden flex items-center justify-center">
                  {m.avatar_url
                    ? <img src={m.avatar_url} className="w-full h-full object-cover" alt="" />
                    : <span className="text-blue-600 dark:text-blue-400 font-bold text-lg">{m.name?.[0]?.toUpperCase()}</span>}
                </div>
                <span className="text-xs text-gray-600 dark:text-gray-300 font-medium">{m.name?.split(' ')[0]}</span>
                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">{m.score} ⭐</span>
              </div>
            ))}
          </div>
        </section>

        {/* Featured moment */}
        {featuredMoment && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-800 dark:text-white">רגע אחרון 📸</h3>
              <button onClick={() => navigate('/moments')} className="text-blue-600 dark:text-blue-400 text-sm font-medium">הכל</button>
            </div>
            <button onClick={() => navigate('/moments')}
              className="w-full relative rounded-2xl overflow-hidden shadow-sm active:scale-95 transition-transform">
              <img
                src={`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}${featuredMoment.image_url}`}
                alt={featuredMoment.caption || 'רגע משפחתי'}
                className="w-full h-40 object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
              {featuredMoment.caption && (
                <p className="absolute bottom-3 right-3 text-white text-sm font-semibold">{featuredMoment.caption}</p>
              )}
            </button>
          </section>
        )}

      </main>
      <BottomNav />
      <FAB />
    </div>
  )
}

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0f4f8] dark:bg-gray-900">
      <span className="text-4xl animate-pulse">🏠</span>
    </div>
  )
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'בוקר טוב'
  if (h < 17) return 'צהריים טובים'
  if (h < 21) return 'ערב טוב'
  return 'לילה טוב'
}
