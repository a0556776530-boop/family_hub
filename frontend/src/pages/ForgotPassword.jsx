import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../api/client'

const QUESTIONS = [
  'מה שם חיית המחמד הראשונה שלך?',
  'באיזה עיר גדלת?',
  'מה שם בית הספר היסודי שלך?',
  'מה התחביב האהוב עליך?',
]

const INPUT_CLS = 'w-full bg-white/15 border border-white/25 text-white placeholder:text-blue-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/50'

export default function ForgotPassword() {
  const navigate = useNavigate()
  const [form, setForm]     = useState({ email: '', secret_answer: '', new_password: '', confirm: '' })
  const [error, setError]   = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (form.new_password.length < 6) return setError('הסיסמה חייבת להכיל לפחות 6 תווים')
    if (form.new_password !== form.confirm) return setError('הסיסמאות אינן תואמות')
    setLoading(true)
    try {
      await api.post('/api/auth/forgot-password', {
        email:          form.email,
        secret_answer:  form.secret_answer,
        new_password:   form.new_password,
      })
      setSuccess(true)
      setTimeout(() => navigate('/login', { replace: true }), 2000)
    } catch (err) {
      setError(err.response?.data?.message || 'שגיאה, נסה שוב')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-700 flex flex-col items-center justify-center px-6">
      <div className="text-4xl mb-2">🔑</div>
      <h1 className="text-2xl font-extrabold text-white mb-1">שחזור סיסמה</h1>
      <p className="text-blue-200 text-sm mb-8">ענה על שאלת הביטחון כדי לאפס סיסמה</p>

      {success ? (
        <div className="bg-green-500/20 border border-green-400/40 text-green-100 text-center rounded-2xl px-6 py-6">
          <p className="text-3xl mb-2">✅</p>
          <p className="font-bold text-lg">הסיסמה שונתה בהצלחה!</p>
          <p className="text-sm mt-1 text-green-200">מעביר אותך לכניסה...</p>
        </div>
      ) : (
        <form onSubmit={submit} className="w-full max-w-sm space-y-4">
          {error && (
            <div className="bg-red-500/20 border border-red-400/40 text-red-100 text-sm rounded-xl px-4 py-3 text-center">
              {error}
            </div>
          )}

          <div>
            <label className="block text-blue-100 text-sm font-medium mb-1.5">אימייל</label>
            <input type="email" required value={form.email} onChange={e => set('email', e.target.value)}
              placeholder="your@email.com" className={INPUT_CLS} />
          </div>

          <div>
            <label className="block text-blue-100 text-sm font-medium mb-1.5">תשובת הביטחון</label>
            <p className="text-blue-300 text-xs mb-2">אחת מהשאלות: שם חיית מחמד / עיר גדילה / בית ספר יסודי / תחביב</p>
            <input type="text" required value={form.secret_answer} onChange={e => set('secret_answer', e.target.value)}
              placeholder="התשובה שלך..." className={INPUT_CLS} />
          </div>

          <div>
            <label className="block text-blue-100 text-sm font-medium mb-1.5">סיסמה חדשה</label>
            <input type="password" required value={form.new_password} onChange={e => set('new_password', e.target.value)}
              placeholder="לפחות 6 תווים" className={INPUT_CLS} />
          </div>

          <div>
            <label className="block text-blue-100 text-sm font-medium mb-1.5">אשר סיסמה</label>
            <input type="password" required value={form.confirm} onChange={e => set('confirm', e.target.value)}
              placeholder="חזור על הסיסמה" className={INPUT_CLS} />
          </div>

          <button type="submit" disabled={loading}
            className="w-full bg-white text-blue-700 font-bold py-3.5 rounded-2xl text-base shadow-lg active:scale-95 transition-transform disabled:opacity-60 mt-2">
            {loading ? 'מאמת...' : 'אפס סיסמה'}
          </button>
        </form>
      )}

      <p className="text-blue-200 text-sm mt-6">
        <Link to="/login" className="text-white font-bold underline underline-offset-2">
          חזרה להתחברות
        </Link>
      </p>
    </div>
  )
}
