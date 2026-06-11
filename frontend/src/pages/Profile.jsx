import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../components/layout/Header'
import BottomNav from '../components/layout/BottomNav'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'

const ROLE_CONFIG = {
  parent: { label: 'הורה', emoji: '👨‍👩‍👧', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  child:  { label: 'ילד',  emoji: '👦',      color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
  admin:  { label: 'הורה', emoji: '👨‍👩‍👧', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  member: { label: 'ילד',  emoji: '👦',      color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
}

export default function Profile() {
  const { user, logout, refreshUser } = useAuth()
  const navigate = useNavigate()
  const fileRef  = useRef(null)
  const [uploading, setUploading]   = useState(false)
  const [showLogout, setShowLogout] = useState(false)

  const level     = Math.floor((user?.score || 0) / 100) + 1
  const xpInLevel = (user?.score || 0) % 100
  const xpPct     = xpInLevel

  const role    = user?.role || 'child'
  const roleConf = ROLE_CONFIG[role] || ROLE_CONFIG.child
  const wallet  = user?.wallet_balance ?? 0

  const onAvatarChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('avatar', file)
      await api.post('/api/auth/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      await refreshUser()
    } catch {
      // silent
    } finally {
      setUploading(false)
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/splash', { replace: true })
  }

  return (
    <div className="min-h-screen bg-[#f0f4f8] dark:bg-gray-900">
      <Header />
      <main className="page-scroll px-4 max-w-lg mx-auto space-y-5 pb-24">

        {/* Profile card */}
        <div className="bg-gradient-to-l from-blue-700 to-blue-500 dark:from-blue-900 dark:to-blue-700 rounded-2xl p-6 text-white shadow-md flex flex-col items-center">
          <div className="relative mb-4">
            <div className="w-20 h-20 rounded-full bg-white/20 ring-4 ring-white/40 overflow-hidden flex items-center justify-center">
              {uploading
                ? <span className="text-2xl animate-spin">⏳</span>
                : user?.avatar_url
                  ? <img src={user.avatar_url} className="w-full h-full object-cover" alt="" />
                  : <span className="text-3xl font-extrabold text-white">{user?.name?.[0]?.toUpperCase()}</span>}
            </div>
            <button onClick={() => fileRef.current?.click()}
              className="absolute -bottom-1 -left-1 w-7 h-7 bg-white rounded-full flex items-center justify-center shadow-md">
              <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onAvatarChange} />
          </div>

          <h2 className="text-xl font-extrabold mb-0.5">{user?.name}</h2>
          <p className="text-blue-200 text-sm mb-2">{user?.email}</p>
          <div className="flex items-center gap-2">
            <span className="bg-white/20 text-white text-xs font-semibold px-3 py-1 rounded-full">
              {roleConf.emoji} {roleConf.label}
            </span>
          </div>
        </div>

        {/* Wallet card — always visible */}
        <div className="bg-gradient-to-l from-violet-600 to-purple-500 dark:from-violet-900 dark:to-purple-800 rounded-2xl p-4 text-white shadow-md flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center text-2xl shrink-0">💰</div>
          <div className="flex-1">
            <p className="text-purple-100 text-xs font-medium mb-0.5">יתרת הארנק</p>
            <p className="text-3xl font-extrabold">{wallet} <span className="text-xl font-bold text-purple-200">XP</span></p>
          </div>
          <button onClick={() => navigate('/rewards')}
            className="bg-white/20 hover:bg-white/30 text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors">
            לחנות
          </button>
        </div>

        {/* Score card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-800 dark:text-white">ניקוד אישי</h3>
            <span className="text-2xl font-extrabold text-blue-600 dark:text-blue-400">{user?.score || 0} ⭐</span>
          </div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-xl shrink-0">🏆</div>
            <div className="flex-1">
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-bold text-gray-700 dark:text-gray-200">רמה {level}</span>
                <span className="text-xs text-gray-400">{xpInLevel}/100 XP</span>
              </div>
              <div className="bg-gray-100 dark:bg-gray-700 rounded-full h-2">
                <div className="bg-amber-400 rounded-full h-2 transition-all" style={{ width: `${xpPct}%` }} />
              </div>
            </div>
          </div>
          <p className="text-gray-400 text-xs text-center mt-2">השלם משימות כדי לצבור נקודות ולעלות רמות!</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'רמה', value: level, emoji: '🏆' },
            { label: 'ניקוד', value: user?.score || 0, emoji: '⭐' },
            { label: 'XP לרמה', value: 100 - xpInLevel, emoji: '⚡' },
          ].map(s => (
            <div key={s.label} className="bg-white dark:bg-gray-800 rounded-2xl p-3 text-center shadow-sm">
              <div className="text-xl mb-1">{s.emoji}</div>
              <div className="text-lg font-extrabold text-gray-800 dark:text-white">{s.value}</div>
              <div className="text-gray-400 text-[10px]">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Role badge */}
        <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl shadow-sm ${roleConf.color}`}>
          <span className="text-2xl">{roleConf.emoji}</span>
          <div>
            <p className="font-bold text-sm">תפקיד: {roleConf.label}</p>
            <p className="text-xs opacity-70">
              {role === 'parent' || role === 'admin'
                ? 'מנהל משימות, מאשר השלמות ומוסיף פרסים'
                : 'משלים משימות, צובר XP ופודה פרסים'}
            </p>
          </div>
        </div>

        {/* Logout */}
        <button onClick={() => setShowLogout(true)}
          className="w-full bg-white dark:bg-gray-800 text-red-500 font-bold py-4 rounded-2xl shadow-sm border border-red-100 dark:border-red-900/40 active:scale-95 transition-transform flex items-center justify-center gap-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          התנתקות
        </button>

      </main>

      {showLogout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setShowLogout(false)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-xs text-center shadow-xl">
            <p className="text-4xl mb-3">👋</p>
            <h3 className="font-bold text-gray-800 dark:text-white text-lg mb-2">להתנתק?</h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-5">בטוח שברצונך להתנתק מהחשבון?</p>
            <div className="flex gap-3">
              <button onClick={() => setShowLogout(false)}
                className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-semibold text-sm active:scale-95 transition-transform">
                ביטול
              </button>
              <button onClick={handleLogout}
                className="flex-1 py-3 rounded-xl bg-red-500 text-white font-bold text-sm active:scale-95 transition-transform">
                התנתק
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  )
}
