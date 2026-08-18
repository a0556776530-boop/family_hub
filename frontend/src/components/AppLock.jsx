import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'
import { isWebAuthnSupported, loginWithFingerprint } from '../utils/webauthn'

const LOCK_AFTER_MS = 5 * 60 * 1000

export default function AppLock({ children }) {
  const { user, setAuthToken, logout } = useAuth()
  const [locked, setLocked]     = useState(false)
  const [method, setMethod]     = useState('fingerprint')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [hasFp, setHasFp]       = useState(false)
  const autoTriggered = useRef(false)

  const unlock = useCallback(() => {
    sessionStorage.setItem('fh_last_active', Date.now().toString())
    autoTriggered.current = false
    setLocked(false)
    setError('')
    setPassword('')
  }, [])

  const handleFingerprint = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const { token, user: u } = await loginWithFingerprint(user.email, api)
      setAuthToken(token, u)
      unlock()
    } catch (e) {
      if (e.name === 'NotAllowedError') {
        setError('בוטל — נסה שוב')
      } else {
        setMethod('password')
        setError('')
      }
    } finally { setLoading(false) }
  }, [user?.email, setAuthToken, unlock])

  // Check if fingerprint is enrolled
  useEffect(() => {
    if (!user || !isWebAuthnSupported()) { setMethod('password'); return }
    api.get('/api/auth/webauthn/status')
      .then(r => {
        setHasFp(r.data.registered)
        if (!r.data.registered) setMethod('password')
      })
      .catch(() => setMethod('password'))
  }, [user?.id])

  // Auto-trigger fingerprint prompt when lock screen first appears
  useEffect(() => {
    if (!locked || !hasFp || method !== 'fingerprint' || autoTriggered.current) return
    autoTriggered.current = true
    handleFingerprint()
  }, [locked, hasFp, method, handleFingerprint])

  // Lock on app load if user is already logged in
  useEffect(() => {
    if (!user) { setLocked(false); return }
    const lastActive = sessionStorage.getItem('fh_last_active')
    if (!lastActive || Date.now() - parseInt(lastActive) > LOCK_AFTER_MS) {
      setLocked(true)
    }
  }, [user?.id])

  // Keep "last active" timestamp while app is in use
  useEffect(() => {
    if (!user || locked) return
    const tick = () => sessionStorage.setItem('fh_last_active', Date.now().toString())
    tick()
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  }, [user?.id, locked])

  // Re-lock when returning from background after timeout
  useEffect(() => {
    const onVisible = () => {
      if (!user) return
      const last = sessionStorage.getItem('fh_last_active')
      if (!last || Date.now() - parseInt(last) > LOCK_AFTER_MS) {
        setLocked(true)
        setError('')
        setPassword('')
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [user?.id])

  const handlePassword = async () => {
    if (!password) return
    setLoading(true); setError('')
    try {
      const res = await api.post('/api/auth/login', { email: user.email, password })
      setAuthToken(res.data.token, res.data.user)
      unlock()
    } catch {
      setError('סיסמה שגויה')
    } finally { setLoading(false) }
  }

  if (!user || !locked) return children

  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-700 flex flex-col items-center justify-center px-6">
      <div className="w-20 h-20 rounded-full bg-white/20 ring-4 ring-white/40 overflow-hidden flex items-center justify-center mb-4">
        {user.avatar_url
          ? <img src={user.avatar_url} className="w-full h-full object-cover" alt="" />
          : <span className="text-3xl font-extrabold text-white">{user.name?.[0]?.toUpperCase()}</span>}
      </div>
      <h2 className="text-xl font-extrabold text-white mb-1">{user.name}</h2>
      <p className="text-blue-200 text-sm mb-8">אמת זהות להמשך</p>

      {error && (
        <div className="bg-red-500/20 border border-red-400/40 text-red-100 text-sm rounded-xl px-4 py-2.5 text-center mb-4 w-full max-w-xs">
          {error}
        </div>
      )}

      <div className="w-full max-w-xs space-y-3">
        {method === 'fingerprint' && hasFp ? (
          <>
            <button onClick={handleFingerprint} disabled={loading}
              className="w-full bg-white text-blue-700 font-bold py-4 rounded-2xl text-base shadow-lg active:scale-95 transition-transform disabled:opacity-60 flex items-center justify-center gap-2">
              {loading ? <span className="animate-pulse">מאמת...</span> : <><span className="text-2xl">👆</span> טביעת אצבע</>}
            </button>
            <button onClick={() => { setMethod('password'); setError('') }}
              className="w-full text-blue-200 text-sm py-2 hover:text-white transition-colors">
              כנס עם סיסמה במקום
            </button>
          </>
        ) : (
          <>
            <input
              type="password"
              autoFocus
              placeholder="סיסמה"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handlePassword()}
              className="w-full bg-white/15 border border-white/25 text-white placeholder:text-blue-300 rounded-xl px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-white/50 text-right"
            />
            <button onClick={handlePassword} disabled={loading || !password}
              className="w-full bg-white text-blue-700 font-bold py-3.5 rounded-2xl text-base shadow-lg active:scale-95 transition-transform disabled:opacity-60">
              {loading ? 'מאמת...' : 'כניסה'}
            </button>
            {hasFp && (
              <button onClick={() => { setMethod('fingerprint'); setError('') }}
                className="w-full text-blue-200 text-sm py-2 hover:text-white transition-colors flex items-center justify-center gap-1">
                <span>👆</span> השתמש בטביעת אצבע
              </button>
            )}
          </>
        )}

        <button onClick={() => { logout(); setLocked(false) }}
          className="w-full text-blue-300/60 text-xs py-2 hover:text-blue-200 transition-colors">
          כניסה עם חשבון אחר
        </button>
      </div>
    </div>
  )
}
