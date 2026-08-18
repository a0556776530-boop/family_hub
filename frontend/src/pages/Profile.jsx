import { useRef, useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import BottomNav from '../components/layout/BottomNav'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useFamily } from '../context/FamilyContext'
import { useLocationTrackingContext } from '../context/LocationTrackingContext'
import { isWebAuthnSupported, registerFingerprint } from '../utils/webauthn'
import LocationConsentScreen from '../components/LocationConsentScreen'
import { RINGTONES, getSelectedRingtone, setSelectedRingtone, playRingtone } from '../utils/ringtones'

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ msg, type, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2800)
    return () => clearTimeout(t)
  }, [])
  const bg = type === 'error' ? 'bg-red-500' : 'bg-emerald-500'
  return (
    <div className={`fixed top-5 left-1/2 -translate-x-1/2 z-[200] ${bg} text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2 animate-[fadeInDown_.25s_ease]`}>
      {type === 'error' ? '⚠️' : '✅'} {msg}
    </div>
  )
}

// ─── Password strength ────────────────────────────────────────────────────────
function StrengthBar({ pw }) {
  if (!pw) return null
  const strength = pw.length >= 12 && /[A-Z]/.test(pw) && /\d/.test(pw) ? 3
    : pw.length >= 8 ? 2
    : pw.length >= 6 ? 1 : 0
  const labels = ['חלשה', 'בינונית', 'חזקה', 'מצוינת']
  const colors = ['bg-red-400', 'bg-orange-400', 'bg-yellow-400', 'bg-emerald-500']
  return (
    <div className="mt-1.5">
      <div className="flex gap-1 mb-1">
        {[0,1,2,3].map(i => (
          <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${i <= strength ? colors[strength] : 'bg-gray-200 dark:bg-gray-600'}`} />
        ))}
      </div>
      <p className="text-xs text-gray-400 text-right">חוזק: {labels[strength]}</p>
    </div>
  )
}

// ─── Password Field ───────────────────────────────────────────────────────────
function PwField({ placeholder, value, onChange, autoFocus }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className="w-full bg-gray-50 dark:bg-gray-700/60 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 text-right pr-10"
      />
      <button type="button" tabIndex={-1} onClick={() => setShow(s => !s)}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
        {show
          ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" /></svg>
          : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}
      </button>
    </div>
  )
}

// ─── Settings Row ─────────────────────────────────────────────────────────────
function Row({ icon, label, value, danger, onClick, rightEl, noBorder }) {
  const Tag = (onClick && !rightEl) ? 'button' : 'div'
  return (
    <Tag onClick={onClick}
      className={`w-full flex items-center gap-3.5 px-4 py-3.5 text-right active:bg-gray-50 dark:active:bg-gray-700/60 transition-colors ${!noBorder ? 'border-b border-gray-100 dark:border-gray-700/60' : ''} ${onClick ? 'cursor-pointer' : 'cursor-default'}`}>
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-base shrink-0 ${danger ? 'bg-red-100 dark:bg-red-900/30' : 'bg-blue-50 dark:bg-blue-900/30'}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0 text-right">
        <p className={`text-sm font-semibold ${danger ? 'text-red-500' : 'text-gray-800 dark:text-white'}`}>{label}</p>
        {value && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">{value}</p>}
      </div>
      {rightEl || (onClick &&
        <svg className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      )}
    </Tag>
  )
}

// ─── Section ──────────────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div>
      {title && <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest px-1 mb-1.5">{title}</p>}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
        {children}
      </div>
    </div>
  )
}

// ─── Change Password Sheet ────────────────────────────────────────────────────
function ChangePwSheet({ onClose, onSuccess }) {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async () => {
    setError('')
    if (!form.current) return setError('הכנס את הסיסמה הנוכחית')
    if (form.next.length < 6) return setError('הסיסמה החדשה חייבת להכיל לפחות 6 תווים')
    if (form.next !== form.confirm) return setError('הסיסמאות אינן תואמות')
    setLoading(true)
    try {
      await api.patch('/api/auth/change-password', { current_password: form.current, new_password: form.next })
      onSuccess('הסיסמה עודכנה בהצלחה')
      onClose()
    } catch (e) {
      setError(e.response?.data?.message || 'שגיאה, נסה שוב')
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" dir="rtl">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-t-3xl w-full max-w-lg shadow-2xl pb-safe">
        <div className="flex items-center justify-between px-5 pt-5 pb-1">
          <div className="w-10" />
          <div className="flex flex-col items-center">
            <div className="w-10 h-1 bg-gray-200 dark:bg-gray-600 rounded-full mb-3" />
            <h3 className="text-base font-bold text-gray-800 dark:text-white">שינוי סיסמה</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 pt-4 pb-6 space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 block mb-1.5">סיסמה נוכחית</label>
            <PwField autoFocus placeholder="הכנס סיסמה נוכחית" value={form.current} onChange={e => set('current', e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 block mb-1.5">סיסמה חדשה</label>
            <PwField placeholder="לפחות 6 תווים" value={form.next} onChange={e => set('next', e.target.value)} />
            <StrengthBar pw={form.next} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 block mb-1.5">אישור סיסמה חדשה</label>
            <PwField placeholder="חזור על הסיסמה החדשה" value={form.confirm} onChange={e => set('confirm', e.target.value)} />
            {form.confirm && form.next && form.confirm !== form.next && (
              <p className="text-xs text-red-400 mt-1 text-right">הסיסמאות אינן תואמות</p>
            )}
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-2.5 text-red-600 dark:text-red-400 text-sm text-center">
              {error}
            </div>
          )}

          <button onClick={submit} disabled={loading || !form.current || !form.next || !form.confirm}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold py-3.5 rounded-2xl text-sm mt-2 transition-colors active:scale-95 transform">
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                שומר...
              </span>
            ) : 'שמור סיסמה'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Edit Name Sheet ──────────────────────────────────────────────────────────
function EditNameSheet({ current, onClose, onSuccess }) {
  const [name, setName] = useState(current || '')
  const [loading, setLoading] = useState(false)
  const { refreshUser } = useAuth()

  const submit = async () => {
    if (!name.trim()) return
    setLoading(true)
    try {
      await api.patch('/api/auth/profile', { name: name.trim() })
      await refreshUser()
      onSuccess('השם עודכן')
      onClose()
    } catch { onSuccess('שגיאה', 'error') }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" dir="rtl">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-t-3xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-5 pt-5 pb-1">
          <div className="w-10" />
          <div className="flex flex-col items-center">
            <div className="w-10 h-1 bg-gray-200 dark:bg-gray-600 rounded-full mb-3" />
            <h3 className="text-base font-bold text-gray-800 dark:text-white">עריכת שם</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-5 pt-4 pb-8 space-y-3">
          <input autoFocus value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="שם מלא"
            className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 text-right" />
          <button onClick={submit} disabled={loading || !name.trim()}
            className="w-full bg-blue-600 disabled:opacity-40 text-white font-bold py-3.5 rounded-2xl text-sm transition-colors active:scale-95 transform">
            {loading ? 'שומר...' : 'שמור שם'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────
function ConfirmDialog({ icon, title, desc, confirmLabel, danger, onConfirm, onClose, loading, error }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6" dir="rtl">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-3xl p-6 w-full max-w-xs text-center shadow-2xl">
        <div className="text-4xl mb-3">{icon}</div>
        <h3 className="font-bold text-gray-800 dark:text-white text-lg mb-2">{title}</h3>
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">{desc}</p>
        {error && <p className="text-red-500 text-sm mb-3 bg-red-50 dark:bg-red-900/20 rounded-xl px-3 py-2">{error}</p>}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-semibold text-sm active:scale-95 transition-transform">
            ביטול
          </button>
          <button onClick={onConfirm} disabled={loading}
            className={`flex-1 py-3 rounded-xl font-bold text-sm active:scale-95 transition-transform disabled:opacity-60 text-white ${danger ? 'bg-red-500' : 'bg-blue-600'}`}>
            {loading ? '...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const ROLE_MAP = {
  parent: { label: 'הורה', emoji: '👨‍👩‍👧' },
  admin:  { label: 'הורה', emoji: '👨‍👩‍👧' },
  child:  { label: 'ילד',  emoji: '👦' },
  member: { label: 'ילד',  emoji: '👦' },
}

const LOCATION_STATUS_LABEL = {
  idle:        'כבוי',
  requesting:  'מבקש הרשאה...',
  active:      '🟢 פעיל',
  denied:      '❌ הרשאה נדחתה',
  unsupported: 'לא נתמך במכשיר זה',
  error:       'שגיאה',
}

export default function Profile() {
  const { user, logout, refreshUser } = useAuth()
  const { family, refreshFamily }     = useFamily()
  const location = useLocationTrackingContext()
  const navigate = useNavigate()
  const fileRef  = useRef(null)

  const isChild = user?.role === 'child' || user?.role === 'member'

  const [uploading, setUploading] = useState(false)
  const [sheet, setSheet]         = useState(null) // 'password' | 'name' | 'logout' | 'leave'
  const [showLocationConsent, setShowLocationConsent] = useState(false)
  const [leaveLoading, setLeaveLoading] = useState(false)
  const [leaveError, setLeaveError]     = useState('')
  const [fpRegistered, setFpRegistered] = useState(false)
  const [fpLoading, setFpLoading]       = useState(false)
  const [toast, setToast]               = useState(null) // { msg, type }
  const [selectedRing, setSelectedRing] = useState(getSelectedRingtone)
  const [previewId, setPreviewId]       = useState(null)
  const previewRef = useRef(null)

  const showToast = (msg, type = 'success') => setToast({ msg, type })

  const handlePickRingtone = useCallback((id) => {
    setSelectedRingtone(id)
    setSelectedRing(id)
    // Stop any current preview and play the new one briefly
    previewRef.current?.stop()
    setPreviewId(id)
    const rt = playRingtone(id, 1) // 1 loop preview
    previewRef.current = rt
    setTimeout(() => {
      rt.stop()
      setPreviewId(null)
    }, rt.duration * 1000)
  }, [])

  useEffect(() => {
    if (!isWebAuthnSupported()) return
    api.get('/api/auth/webauthn/status')
      .then(r => setFpRegistered(r.data.registered))
      .catch(() => {})
  }, [])

  const onAvatarChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('avatar', file)
      await api.post('/api/auth/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      await refreshUser()
      showToast('תמונה עודכנה')
    } catch { showToast('שגיאה בהעלאת תמונה', 'error') }
    finally { setUploading(false) }
  }

  const handleFp = async () => {
    setFpLoading(true)
    try {
      if (fpRegistered) {
        await api.delete('/api/auth/webauthn/unregister')
        setFpRegistered(false)
        showToast('טביעת האצבע הוסרה')
      } else {
        await registerFingerprint(api)
        setFpRegistered(true)
        showToast('טביעת האצבע נרשמה!')
      }
    } catch (e) {
      if (e.name === 'NotAllowedError') showToast('בוטל', 'error')
      else showToast(e.response?.data?.message || 'שגיאה', 'error')
    } finally { setFpLoading(false) }
  }

  const handleLeave = async () => {
    setLeaveLoading(true); setLeaveError('')
    try {
      await api.post('/api/family/leave')
      await refreshUser(); await refreshFamily()
      setSheet(null)
      navigate('/family', { replace: true })
    } catch (e) {
      setLeaveError(e.response?.data?.message || 'שגיאה, נסה שוב')
    } finally { setLeaveLoading(false) }
  }

  const handleLogout = () => {
    logout()
    navigate('/splash', { replace: true })
  }

  const role     = ROLE_MAP[user?.role] || ROLE_MAP.child
  const initials = (user?.name || '?')[0].toUpperCase()

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900" dir="rtl">
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}

      {/* Hero */}
      <div className="relative bg-gradient-to-b from-blue-600 to-blue-500 dark:from-blue-900 dark:to-blue-800 pt-14 pb-10 px-6 flex flex-col items-center">
        <div className="absolute top-4 right-4">
          <button onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center backdrop-blur-sm">
            <svg className="w-5 h-5 text-white rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <p className="absolute top-[18px] left-1/2 -translate-x-1/2 text-white font-bold text-base">הגדרות</p>

        {/* Avatar */}
        <div className="relative mb-3">
          <div className="w-24 h-24 rounded-full bg-white/20 ring-4 ring-white/40 overflow-hidden flex items-center justify-center shadow-xl">
            {uploading
              ? <svg className="w-8 h-8 text-white animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              : user?.avatar_url
                ? <img src={user.avatar_url} className="w-full h-full object-cover" alt="" />
                : <span className="text-3xl font-extrabold text-white">{initials}</span>}
          </div>
          <button onClick={() => fileRef.current?.click()}
            className="absolute -bottom-1 -left-1 w-8 h-8 bg-white rounded-full shadow-md flex items-center justify-center border-2 border-blue-100">
            <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          {user?.avatar_url && (
            <button onClick={async () => {
              try { await api.delete('/api/auth/avatar'); await refreshUser(); showToast('תמונה הוסרה') }
              catch { showToast('שגיאה', 'error') }
            }}
              className="absolute -bottom-1 -right-1 w-8 h-8 bg-red-500 rounded-full shadow-md flex items-center justify-center border-2 border-white">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onAvatarChange} />
        </div>

        <h2 className="text-xl font-extrabold text-white leading-tight">{user?.name}</h2>
        <p className="text-blue-200 text-sm mt-0.5">{user?.email}</p>
        <div className="mt-2 bg-white/20 rounded-full px-3 py-1 text-white text-xs font-semibold">
          {role.emoji} {role.label}
        </div>
      </div>

      {/* Settings sections */}
      <main className="px-4 pt-5 pb-28 max-w-lg mx-auto space-y-5">

        {/* Profile */}
        <Section title="פרופיל">
          <Row icon="✏️" label="שינוי שם" value={user?.name} onClick={() => setSheet('name')} />
          <Row icon="🖼️" label="תמונת פרופיל" value="לחץ לשינוי" onClick={() => fileRef.current?.click()} noBorder />
        </Section>

        {/* Security */}
        <Section title="אבטחה">
          <Row icon="🔑" label="שינוי סיסמה" value="לחץ לעדכון" onClick={() => setSheet('password')} />
          {isWebAuthnSupported() && (
            <Row icon="👆" label="טביעת אצבע / Face ID"
              value={fpRegistered ? '✅ פעיל' : 'לא מוגדר'}
              noBorder
              rightEl={
                <button onClick={handleFp} disabled={fpLoading}
                  className={`text-xs font-bold px-3.5 py-1.5 rounded-xl transition-colors active:scale-95 disabled:opacity-50 ${fpRegistered ? 'bg-red-50 text-red-500 dark:bg-red-900/20 dark:text-red-400' : 'bg-blue-600 text-white'}`}>
                  {fpLoading ? '...' : fpRegistered ? 'הסר' : 'הפעל'}
                </button>
              }
            />
          )}
        </Section>

        {/* Location sharing */}
        {isChild && location && (
          <Section title="מיקום">
            <Row icon="📍" label="שיתוף מיקום עם ההורים"
              value={LOCATION_STATUS_LABEL[location.status] || location.status}
              noBorder
              rightEl={
                <button
                  onClick={() => location.consented ? location.revoke() : setShowLocationConsent(true)}
                  disabled={location.status === 'requesting'}
                  className={`text-xs font-bold px-3.5 py-1.5 rounded-xl transition-colors active:scale-95 disabled:opacity-50 ${location.consented ? 'bg-red-50 text-red-500 dark:bg-red-900/20 dark:text-red-400' : 'bg-blue-600 text-white'}`}>
                  {location.status === 'requesting' ? '...' : location.consented ? 'כבה' : 'הפעל'}
                </button>
              }
            />
          </Section>
        )}

        {/* Ringtone picker */}
        <Section title="צליל צלצול">
          <div className="divide-y divide-gray-50 dark:divide-gray-700">
            {RINGTONES.map((rt, idx) => {
              const isSelected = selectedRing === rt.id
              const isPreviewing = previewId === rt.id
              const isLast = idx === RINGTONES.length - 1
              return (
                <div key={rt.id}
                  className={`flex items-center gap-3 px-4 py-3.5 ${!isLast ? 'border-b border-gray-100 dark:border-gray-700/60' : ''}`}>
                  {/* Checkmark / radio */}
                  <button onClick={() => handlePickRingtone(rt.id)}
                    className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors
                      ${isSelected ? 'border-blue-600 bg-blue-600' : 'border-gray-300 dark:border-gray-600'}`}>
                    {isSelected && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>

                  {/* Labels */}
                  <button onClick={() => handlePickRingtone(rt.id)} className="flex-1 text-right min-w-0">
                    <p className={`text-sm font-semibold ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-gray-800 dark:text-white'}`}>
                      {rt.label}
                    </p>
                    <p className="text-xs text-gray-400">{rt.desc}</p>
                  </button>

                  {/* Play preview */}
                  <button
                    onClick={() => {
                      if (isPreviewing) { previewRef.current?.stop(); setPreviewId(null); return }
                      previewRef.current?.stop()
                      setPreviewId(rt.id)
                      const r = playRingtone(rt.id, 1)
                      previewRef.current = r
                      setTimeout(() => { r.stop(); setPreviewId(null) }, r.duration * 1000)
                    }}
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors
                      ${isPreviewing ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                    {isPreviewing
                      ? <span className="w-2.5 h-2.5 bg-white rounded-sm" />
                      : <svg className="w-3.5 h-3.5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                    }
                  </button>
                </div>
              )
            })}
          </div>
        </Section>

        {/* Family */}
        {family && (
          <Section title="משפחה">
            <Row icon="🏠" label={family.name || 'המשפחה שלי'} value={`${family.members?.length || 1} חברים`} />
            <Row icon="🚪" label="עזוב משפחה" danger onClick={() => { setLeaveError(''); setSheet('leave') }} noBorder />
          </Section>
        )}

        {/* Account */}
        <Section title="חשבון">
          <Row icon="👋" label="התנתקות" danger onClick={() => setSheet('logout')} noBorder />
        </Section>

        <p className="text-center text-xs text-gray-300 dark:text-gray-600 pt-2">גרסת האפליקציה 1.0</p>
      </main>

      {/* Sheets & Dialogs */}
      {sheet === 'password' && (
        <ChangePwSheet onClose={() => setSheet(null)} onSuccess={msg => showToast(msg)} />
      )}
      {sheet === 'name' && (
        <EditNameSheet current={user?.name} onClose={() => setSheet(null)} onSuccess={(msg, t) => showToast(msg, t)} />
      )}
      {sheet === 'logout' && (
        <ConfirmDialog icon="👋" title="להתנתק?" desc="בטוח שברצונך להתנתק מהחשבון?"
          confirmLabel="התנתק" danger onConfirm={handleLogout} onClose={() => setSheet(null)} />
      )}
      {sheet === 'leave' && (
        <ConfirmDialog icon="🚪" title="לעזוב את המשפחה?" desc="תוכל להצטרף למשפחה אחרת בעזרת קוד הזמנה חדש."
          confirmLabel="עזוב" danger onConfirm={handleLeave} onClose={() => setSheet(null)}
          loading={leaveLoading} error={leaveError} />
      )}
      {showLocationConsent && (
        <LocationConsentScreen
          onAllow={async () => { setShowLocationConsent(false); await location.grant() }}
          onDecline={() => setShowLocationConsent(false)}
        />
      )}

      <BottomNav />
    </div>
  )
}
