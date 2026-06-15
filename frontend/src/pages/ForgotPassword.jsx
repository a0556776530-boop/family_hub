import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../api/client'

export default function ForgotPassword() {
  const navigate = useNavigate()
  const [step, setStep]       = useState('email') // 'email' | 'code'
  const [email, setEmail]     = useState('')
  const [code, setCode]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState('')

  const sendCode = async (e) => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      await api.post('/api/auth/forgot-password', { email })
      setStep('code')
      setSuccess('נשלח קוד לאימייל שלך')
    } catch (err) {
      setError(err.response?.data?.message || 'שגיאה בשליחה')
    } finally {
      setLoading(false)
    }
  }

  const resetPassword = async (e) => {
    e.preventDefault()
    if (password !== confirm) { setError('הסיסמאות לא תואמות'); return }
    setError(''); setLoading(true)
    try {
      await api.post('/api/auth/reset-password', { email, code, password })
      setSuccess('הסיסמה עודכנה! מעביר להתחברות...')
      setTimeout(() => navigate('/login'), 2000)
    } catch (err) {
      setError(err.response?.data?.message || 'שגיאה באיפוס')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-700 flex flex-col items-center justify-center px-6">
      <div className="text-4xl mb-2">🔑</div>
      <h1 className="text-2xl font-extrabold text-white mb-1">
        {step === 'email' ? 'שכחתי סיסמה' : 'הכנס קוד'}
      </h1>
      <p className="text-blue-200 text-sm mb-8">
        {step === 'email' ? 'נשלח לך קוד לאימייל' : `נשלח קוד ל-${email}`}
      </p>

      <div className="w-full max-w-sm space-y-4">
        {error && (
          <div className="bg-red-500/20 border border-red-400/40 text-red-100 text-sm rounded-xl px-4 py-3 text-center">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-500/20 border border-green-400/40 text-green-100 text-sm rounded-xl px-4 py-3 text-center">
            {success}
          </div>
        )}

        {step === 'email' ? (
          <form onSubmit={sendCode} className="space-y-4">
            <div>
              <label className="block text-blue-100 text-sm font-medium mb-1.5">אימייל</label>
              <input
                type="email" required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full bg-white/15 border border-white/25 text-white placeholder:text-blue-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/50"
              />
            </div>
            <button
              type="submit" disabled={loading}
              className="w-full bg-white text-blue-700 font-bold py-3.5 rounded-2xl shadow-lg active:scale-95 transition-transform disabled:opacity-60">
              {loading ? 'שולח...' : 'שלח קוד'}
            </button>
          </form>
        ) : (
          <form onSubmit={resetPassword} className="space-y-4">
            <div>
              <label className="block text-blue-100 text-sm font-medium mb-1.5">קוד מהמייל</label>
              <input
                type="text" required inputMode="numeric" maxLength={6}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="w-full bg-white/15 border border-white/25 text-white placeholder:text-blue-300 rounded-xl px-4 py-3 text-sm text-center tracking-[0.5em] text-lg font-bold focus:outline-none focus:ring-2 focus:ring-white/50"
              />
            </div>
            <div>
              <label className="block text-blue-100 text-sm font-medium mb-1.5">סיסמה חדשה</label>
              <input
                type="password" required minLength={6}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="לפחות 6 תווים"
                className="w-full bg-white/15 border border-white/25 text-white placeholder:text-blue-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/50"
              />
            </div>
            <div>
              <label className="block text-blue-100 text-sm font-medium mb-1.5">אימות סיסמה</label>
              <input
                type="password" required
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="חזור על הסיסמה"
                className="w-full bg-white/15 border border-white/25 text-white placeholder:text-blue-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/50"
              />
            </div>
            <button
              type="submit" disabled={loading}
              className="w-full bg-white text-blue-700 font-bold py-3.5 rounded-2xl shadow-lg active:scale-95 transition-transform disabled:opacity-60">
              {loading ? 'מעדכן...' : 'עדכן סיסמה'}
            </button>
            <button
              type="button"
              onClick={() => { setStep('email'); setError(''); setSuccess('') }}
              className="w-full text-blue-200 text-sm underline">
              שלח קוד חדש
            </button>
          </form>
        )}

        <p className="text-blue-200 text-sm text-center mt-4">
          <Link to="/login" className="text-white font-bold underline underline-offset-2">
            חזור להתחברות
          </Link>
        </p>
      </div>
    </div>
  )
}
