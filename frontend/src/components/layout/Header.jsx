import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useFamily } from '../../context/FamilyContext'
import { useTheme } from '../../context/ThemeContext'

const ROOT_PATHS = new Set(['/', '/tasks', '/board', '/rewards', '/profile'])

export default function Header() {
  const { user }    = useAuth()
  const { family }  = useFamily()
  const { dark, toggle } = useTheme()
  const navigate    = useNavigate()
  const location    = useLocation()

  const initial  = user?.name?.[0]?.toUpperCase() || '?'
  const canGoBack = !ROOT_PATHS.has(location.pathname)

  return (
    <header
      className="fixed top-0 inset-x-0 z-30 bg-gradient-to-l from-blue-700 to-blue-600 dark:from-gray-900 dark:to-gray-800 shadow-md"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="flex items-center justify-between px-4 h-16 max-w-lg mx-auto">
        <div className="flex items-center gap-2.5 min-w-0">
          {canGoBack && (
            <button
              onClick={() => navigate(-1)}
              aria-label="חזרה"
              className="w-9 h-9 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 transition-colors shrink-0 ml-1"
            >
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
          <div className="w-9 h-9 rounded-full bg-white/25 ring-2 ring-white/50 flex items-center justify-center shrink-0 overflow-hidden">
            {user?.avatar_url
              ? <img src={user.avatar_url} className="w-full h-full object-cover" alt="" />
              : <span className="text-white font-bold text-sm">{initial}</span>}
          </div>
          <div className="min-w-0">
            <p className="text-blue-100 text-xs truncate">שלום, {user?.name?.split(' ')[0]} 👋</p>
            <h1 className="text-white font-bold text-base leading-tight truncate">
              {family ? `משפחת ${family.name}` : 'Family Hub'}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Dark mode toggle */}
          <button
            onClick={toggle}
            aria-label="החלף מצב תצוגה"
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 transition-colors text-lg"
          >
            {dark ? '☀️' : '🌙'}
          </button>

          {/* Notifications */}
          <button className="relative w-9 h-9 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 transition-colors">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <span className="absolute top-2 left-2 w-2 h-2 rounded-full bg-red-400 ring-2 ring-blue-600 dark:ring-gray-900" />
          </button>
        </div>
      </div>
    </header>
  )
}
