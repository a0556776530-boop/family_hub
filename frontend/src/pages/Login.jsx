import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const navigate  = useNavigate()
  const [form, setForm]     = useState({ email: '', password: '' })
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(form.email, form.password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.response?.data?.message || 'שגיאה בהתחברות')
    } finally {
      setLoading(false)
    }
  }

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

        <div>
          <label className="block text-blue-100 text-sm font-medium mb-1.5">סיסמה</label>
          <input
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
      </form>

      <p className="text-blue-200 text-sm mt-6">
        אין לך חשבון?{' '}
        <Link to="/register" className="text-white font-bold underline underline-offset-2">
          הרשמה
        </Link>
      </p>
    </div>
  )
}
