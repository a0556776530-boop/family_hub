import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'
import { isWebAuthnSupported, loginWithFingerprint } from '../utils/webauthn'

export default function Login() {
  const { login, setAuthToken } = useAuth()
  const navigate    = useNavigate()
  const passwordRef = useRef(null)
  const savedEmail  = localStorage.getItem('fh_saved_email') || ''
  const [form, setForm]         = useState({ email: savedEmail, password: '' })
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [fpLoading, setFpLoading] = useState(false)

  useEffect(() => {
    if (savedEmail) passwordRef.current?.focus()
  }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(form.email, form.password)
      localStorage.setItem('fh_saved_email', form.email)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.response?.data?.message || 'שגיאה בהתחברות')
    } finally {
      setLoading(false)
    }
  }

  const handleFingerprint = async () => {
    if (!form.email) return setError('הכנס אימייל כדי להשתמש בטביעת אצבע')
    setError('')
    setFpLoading(true)
    try {
      const { token, user } = await loginWithFingerprint(form.email, api)
      setAuthToken(token, user)
      navigate('/', { replace: true })
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setError('האימות בוטל')
      } else if (err.response?.data?.error === 'no_credentials') {
        setError('לא נרשמה טביעת אצבע לחשבון זה — כנס עם סיסמה תחילה')
      } else {
        setError(err.response?.data?.message || 'שגיאה בזיהוי טביעת אצבע')
      }
    } finally {
      setFpLoading(false)
    }
  }

  const webAuthnOk = isWebAuthnSupported()

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-700 flex flex-col items-center justify-center px-6">
      <div className="text-4xl mb-2">🏠</div>
      <h1 className="text-2xl font-extrabold text-white mb-1">ברוך הבא</h1>
      <p className="text-blue-200 text-sm mb-8">התחבר לחשבונך</p>

      <form onSubmit={submit} className="w-full max-w-sm space-y-4">
        {error && (
          <div className="bg-red-500/20 border border-red-400/40 text-red-100 text-sm rounded-xl px-4 py-3 text-center">
            {error}
          </div>
        )}

        {savedEmail ? (
          <div className="flex items-center justify-between bg-white/10 border border-white/20 rounded-xl px-4 py-3">
            <span className="text-white text-sm">{form.email}</span>
            <button type="button" onClick={() => { set('email', ''); localStorage.removeItem('fh_saved_email'); window.location.reload() }}
              className="text-blue-300 text-xs hover:text-white transition-colors">
              שנה חשבון
            </button>
          </div>
        ) : (
          <div>
            <label className="block text-blue-100 text-sm font-medium mb-1.5">אימייל</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={e => set('email', e.target.value)}
              placeholder="your@email.com"
              className="w-full bg-white/15 border border-white/25 text-white placeholder:text-blue-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/50"
            />
          </div>
        )}

        <div>
          <label className="block text-blue-100 text-sm font-medium mb-1.5">סיסמה</label>
          <input
            ref={passwordRef}
            type="password"
            required
            value={form.password}
            onChange={e => set('password', e.target.value)}
            placeholder="••••••"
            className="w-full bg-white/15 border border-white/25 text-white placeholder:text-blue-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/50"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-white text-blue-700 font-bold py-3.5 rounded-2xl text-base shadow-lg active:scale-95 transition-transform disabled:opacity-60 mt-2"
        >
          {loading ? 'מתחבר...' : 'התחברות'}
        </button>

        {webAuthnOk && (
          <button
            type="button"
            onClick={handleFingerprint}
            disabled={fpLoading}
            className="w-full bg-white/15 border border-white/30 text-white font-bold py-3.5 rounded-2xl text-base active:scale-95 transition-transform disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {fpLoading ? (
              <span className="animate-pulse">מאמת...</span>
            ) : (
              <>
                <span className="text-xl">👆</span>
                כניסה עם טביעת אצבע
              </>
            )}
          </button>
        )}
      </form>

      <div className="text-center mt-4">
        <Link to="/forgot-password" className="text-blue-200 text-sm hover:text-white transition-colors">
          שכחתי סיסמה 🔑
        </Link>
      </div>

      <p className="text-blue-200 text-sm mt-4">
        אין לך חשבון?{' '}
        <Link to="/register" className="text-white font-bold underline underline-offset-2">
          הרשמה
        </Link>
      </p>
    </div>
  )
}
