import { NavLink } from 'react-router-dom'

const tabs = [
  { to: '/',          label: 'בית',    icon: 'home'     },
  { to: '/shopping',  label: 'קניות',  icon: 'cart'     },
  { to: '/calendar',  label: 'יומן',   icon: 'calendar' },
  { to: '/tasks',     label: 'משימות', icon: 'tasks'    },
  { to: '/profile',   label: 'פרופיל', icon: 'person'   },
]

function Icon({ name, filled }) {
  const cls = 'w-6 h-6 transition-colors'
  const sw  = filled ? 0 : 1.8
  switch (name) {
    case 'home':
      return <svg className={cls} fill={filled ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={sw}><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
    case 'cart':
      return <svg className={cls} fill={filled ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={sw}><path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
    case 'calendar':
      return <svg className={cls} fill={filled ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={sw}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
    case 'tasks':
      return <svg className={cls} fill={filled ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={sw}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
    case 'person':
      return <svg className={cls} fill={filled ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={sw}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
    default: return null
  }
}

export default function BottomNav() {
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-30 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 shadow-[0_-2px_12px_rgba(0,0,0,0.06)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="grid grid-cols-5 h-16 max-w-lg mx-auto">
        {tabs.map(tab => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 transition-colors ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400'}`
            }
          >
            {({ isActive }) => (
              <>
                <div className="relative">
                  <Icon name={tab.icon} filled={isActive} />
                  {isActive && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-600 dark:bg-blue-400" />}
                </div>
                <span className={`text-[10px] leading-none mt-0.5 ${isActive ? 'font-bold' : 'font-medium'}`}>{tab.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
