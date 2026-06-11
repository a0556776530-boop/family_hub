import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const actions = [
  { label: 'משימה חדשה',  emoji: '✅', color: 'from-blue-500 to-blue-600',     path: '/tasks?new=1' },
  { label: 'אירוע חדש',   emoji: '📅', color: 'from-purple-500 to-violet-600', path: '/calendar?new=1' },
  { label: 'פריט לקניות', emoji: '🛒', color: 'from-green-500 to-emerald-600', path: '/shopping?new=1' },
]

export default function FAB() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  const handleAction = (path) => {
    setOpen(false)
    navigate(path)
  }

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
      )}

      <div className="fixed z-50 flex flex-col items-center" style={{ bottom: '88px', left: '50%', transform: 'translateX(-50%)' }}>
        {/* Action pills */}
        <div className={`flex flex-col items-center gap-2 mb-3 transition-all duration-200 ${open ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
          {actions.map(a => (
            <button
              key={a.label}
              onClick={() => handleAction(a.path)}
              className={`flex items-center gap-2 bg-gradient-to-l ${a.color} text-white text-sm font-semibold px-4 py-2 rounded-full shadow-lg whitespace-nowrap active:scale-95 transition-transform`}
            >
              <span>{a.emoji}</span>
              {a.label}
            </button>
          ))}
        </div>

        {/* FAB button */}
        <div className="relative">
          {!open && <span className="absolute inset-0 rounded-full bg-blue-400 opacity-50 animate-ping" style={{ animationDuration: '2.4s' }} />}
          <button
            onClick={() => setOpen(o => !o)}
            aria-label="הוסף"
            className="relative w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 shadow-fab flex items-center justify-center active:scale-90 transition-all hover:from-blue-600 hover:to-indigo-700"
          >
            <svg
              className={`text-white transition-transform duration-300 ${open ? 'rotate-45 w-6 h-6' : 'w-7 h-7'}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>
    </>
  )
}
