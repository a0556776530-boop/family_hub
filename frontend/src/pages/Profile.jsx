import { useRef, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../components/layout/Header'
import BottomNav from '../components/layout/BottomNav'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useFamily } from '../context/FamilyContext'
import { isWebAuthnSupported, registerFingerprint } from '../utils/webauthn'

const ROLE_CONFIG = {
  parent: { label: 'הורה', emoji: '👨‍👩‍👧', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  child:  { label: 'ילד',  emoji: '👦',      color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
  admin:  { label: 'הורה', emoji: '👨‍👩‍👧', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  member: { label: 'ילד',  emoji: '👦',      color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
}

export default function Profile() {
  const { user, logout, refreshUser } = useAuth()
  const { family, refreshFamily } = useFamily()
  const navigate = useNavigate()
  const fileRef  = useRef(null)
  const [uploading, setUploading]   = useState(false)
  const [showLogout, setShowLogout] = useState(false)
  const [showLeave, setShowLeave]   = useState(false)
  const [leaving, setLeaving]       = useState(false)
  const [leaveError, setLeaveError] = useState('')
  const [editName, setEditName]     = useState(false)
  const [nameVal, setNameVal]       = useState('')
  const [savingName, setSavingName] = useState(false)
  const [showChangePw, setShowChangePw] = useState(false)
  const [pwForm, setPwForm]             = useState({ current: '', next: '', confirm: '' })
  const [pwLoading, setPwLoading]       = useState(false)
  const [pwError, setPwError]           = useState('')
  const [pwSuccess, setPwSuccess]       = useState(false)
  const [fpRegistered, setFpRegistered] = useState(false)
  const [fpLoading, setFpLoading]       = useState(false)
  const [fpMsg, setFpMsg]               = useState('')

  useEffect(() => {
    if (!isWebAuthnSupported()) return
    api.get('/api/auth/webauthn/status')
      .then(r => setFpRegistered(r.data.registered))
      .catch(() => {})
  }, [])

  const handleRegisterFingerprint = async () => {
    setFpLoading(true); setFpMsg('')
    try {
      await registerFingerprint(api)
      setFpRegistered(true)
      setFpMsg('✅ טביעת האצבע נרשמה!')
    } catch (e) {
      if (e.name === 'NotAllowedError') setFpMsg('בוטל על ידי המשתמש')
      else setFpMsg(e.response?.data?.message || 'שגיאה ברישום')
    } finally { setFpLoading(false) }
  }

  const handleUnregisterFingerprint = async () => {
    setFpLoading(true); setFpMsg('')
    try {
      await api.delete('/api/auth/webauthn/unregister')
      setFpRegistered(false)
      setFpMsg('טביעת האצבע הוסרה')
    } catch { setFpMsg('שגיאה') }
    finally { setFpLoading(false) }
  }

  const openEditName = () => { setNameVal(user?.name || ''); setEditName(true) }
  const saveName = async () => {
    if (!nameVal.trim()) return
    setSavingName(true)
    try {
      await api.patch('/api/auth/profile', { name: nameVal.trim() })
      await refreshUser()
      setEditName(false)
    } finally { setSavingName(false) }
  }

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

  const openChangePw = () => { setPwForm({ current: '', next: '', confirm: '' }); setPwError(''); setPwSuccess(false); setShowChangePw(true) }
  const handleChangePw = async () => {
    if (!pwForm.current || !pwForm.next) return setPwError('מלא את כל השדות')
    if (pwForm.next.length < 6) return setPwError('סיסמה חדשה חייבת להכיל לפחות 6 תווים')
    if (pwForm.next !== pwForm.confirm) return setPwError('הסיסמאות אינן תואמות')
    setPwLoading(true); setPwError('')
    try {
      await api.patch('/api/auth/change-password', { current_password: pwForm.current, new_password: pwForm.next })
      setPwSuccess(true)
      setTimeout(() => setShowChangePw(false), 1500)
    } catch (e) {
      setPwError(e.response?.data?.message || 'שגיאה, נסה שוב')
    } finally { setPwLoading(false) }
  }

  const handleLeave = async () => {
    setLeaving(true)
    setLeaveError('')
    try {
      await api.post('/api/family/leave')
      await refreshUser()
      await refreshFamily()
      setShowLeave(false)
      navigate('/family', { replace: true })
    } catch (e) {
      setLeaveError(e.response?.data?.message || 'שגיאה, נסה שוב')
    } finally {
      setLeaving(false)
    }
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

          {editName ? (
            <div className="flex items-center gap-2 mb-2">
              <input autoFocus value={nameVal} onChange={e => setNameVal(e.target.value)}
                className="bg-white/20 text-white placeholder:text-white/50 rounded-xl px-3 py-1.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-white/50 w-36 text-center"
                onKeyDown={e => e.key === 'Enter' && saveName()} />
              <button onClick={saveName} disabled={savingName}
                className="bg-white text-blue-600 text-xs font-bold px-3 py-1.5 rounded-xl active:scale-95">
                {savingName ? '...' : 'שמור'}
              </button>
              <button onClick={() => setEditName(false)} className="text-white/60 text-xs">ביטול</button>
            </div>
          ) : (
            <div className="flex items-center gap-2 mb-0.5">
              <h2 className="text-xl font-extrabold">{user?.name}</h2>
              <button onClick={openEditName} className="text-white/60 hover:text-white transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
            </div>
          )}
          <p className="text-blue-200 text-sm mb-2">{user?.email}</p>
          <div className="flex items-center gap-2">
            <span className="bg-white/20 text-white text-xs font-semibold px-3 py-1 rounded-full">
              {roleConf.emoji} {roleConf.label}
            </span>
          </div>
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

        {/* Fingerprint */}
        {isWebAuthnSupported() && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">👆</span>
                <div>
                  <p className="font-bold text-sm text-gray-800 dark:text-white">כניסה עם טביעת אצבע</p>
                  <p className="text-xs text-gray-400">{fpRegistered ? '✅ פעיל' : 'לא מוגדר'}</p>
                </div>
              </div>
              <button
                onClick={fpRegistered ? handleUnregisterFingerprint : handleRegisterFingerprint}
                disabled={fpLoading}
                className={`px-4 py-2 rounded-xl text-sm font-bold active:scale-95 transition-transform disabled:opacity-60 ${
                  fpRegistered
                    ? 'bg-red-50 text-red-500 dark:bg-red-900/20 dark:text-red-400'
                    : 'bg-blue-600 text-white'
                }`}
              >
                {fpLoading ? '...' : fpRegistered ? 'הסר' : 'הפעל'}
              </button>
            </div>
            {fpMsg && <p className="text-sm text-center mt-2 text-gray-500 dark:text-gray-400">{fpMsg}</p>}
          </div>
        )}

        {/* Change password */}
        <button onClick={openChangePw}
          className="w-full bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 font-bold py-4 rounded-2xl shadow-sm border border-blue-100 dark:border-blue-900/40 active:scale-95 transition-transform flex items-center justify-center gap-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
          שנה סיסמה
        </button>

        {/* Leave family */}
        {family && (
          <button onClick={() => setShowLeave(true)}
            className="w-full bg-white dark:bg-gray-800 text-orange-500 font-bold py-4 rounded-2xl shadow-sm border border-orange-100 dark:border-orange-900/40 active:scale-95 transition-transform flex items-center justify-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7" />
            </svg>
            עזוב משפחה
          </button>
        )}

        {/* Logout */}
        <button onClick={() => setShowLogout(true)}
          className="w-full bg-white dark:bg-gray-800 text-red-500 font-bold py-4 rounded-2xl shadow-sm border border-red-100 dark:border-red-900/40 active:scale-95 transition-transform flex items-center justify-center gap-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          התנתקות
        </button>

      </main>

      {showLeave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => { setShowLeave(false); setLeaveError('') }} />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-xs text-center shadow-xl">
            <p className="text-4xl mb-3">🚪</p>
            <h3 className="font-bold text-gray-800 dark:text-white text-lg mb-2">לעזוב את המשפחה?</h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">תוכל להצטרף למשפחה אחרת בעזרת קוד הזמנה חדש.</p>
            {leaveError && <p className="text-red-500 text-sm mb-3 bg-red-50 dark:bg-red-900/20 rounded-xl px-3 py-2">{leaveError}</p>}
            <div className="flex gap-3">
              <button onClick={() => { setShowLeave(false); setLeaveError('') }}
                className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-semibold text-sm active:scale-95 transition-transform">
                ביטול
              </button>
              <button onClick={handleLeave} disabled={leaving}
                className="flex-1 py-3 rounded-xl bg-orange-500 text-white font-bold text-sm active:scale-95 transition-transform disabled:opacity-60">
                {leaving ? '...' : 'עזוב'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showChangePw && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center px-4 pb-6 sm:pb-0">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setShowChangePw(false)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-bold text-gray-800 dark:text-white text-lg mb-4 text-center">שנה סיסמה 🔑</h3>
            <div className="space-y-3">
              <input type="password" placeholder="סיסמה נוכחית" value={pwForm.current}
                onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))}
                className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 text-right" />
              <input type="password" placeholder="סיסמה חדשה (לפחות 6 תווים)" value={pwForm.next}
                onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))}
                className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 text-right" />
              <input type="password" placeholder="אשר סיסמה חדשה" value={pwForm.confirm}
                onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
                className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 text-right" />
            </div>
            {pwError && <p className="text-red-500 text-sm mt-3 bg-red-50 dark:bg-red-900/20 rounded-xl px-3 py-2 text-center">{pwError}</p>}
            {pwSuccess && <p className="text-green-600 text-sm mt-3 bg-green-50 dark:bg-green-900/20 rounded-xl px-3 py-2 text-center">✅ הסיסמה עודכנה בהצלחה!</p>}
            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowChangePw(false)}
                className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-semibold text-sm active:scale-95 transition-transform">
                ביטול
              </button>
              <button onClick={handleChangePw} disabled={pwLoading || pwSuccess}
                className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold text-sm active:scale-95 transition-transform disabled:opacity-60">
                {pwLoading ? '...' : 'שמור'}
              </button>
            </div>
          </div>
        </div>
      )}

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
