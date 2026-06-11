import { useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const INPUT_CLS = 'w-full bg-white/15 border border-white/25 text-white placeholder:text-blue-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/50'

export default function Register() {
  const { register } = useAuth()
  const navigate     = useNavigate()
  const fileRef      = useRef(null)

  const [form, setForm]       = useState({ name: '', email: '', password: '', role: 'child' })
  const [avatar, setAvatar]   = useState(null)
  const [preview, setPreview] = useState(null)
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const onFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatar(file)
    setPreview(URL.createObjectURL(file))
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (form.password.length < 6) { setError('הסיסמה חייבת להכיל לפחות 6 תווים'); return }
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('name', form.name)
      fd.append('email', form.email)
      fd.append('password', form.password)
      fd.append('role', form.role)
      if (avatar) fd.append('avatar', avatar)
      const user = await register(fd)
      navigate(user.family_id ? '/' : '/family-setup', { replace: true })
    } catch (err) {
      setError(err.response?.data?.message || 'שגיאה בהרשמה')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-700 flex flex-col items-center justify-center px-6 py-10">
      <div className="text-4xl mb-2">🏠</div>
      <h1 className="text-2xl font-extrabold text-white mb-1">יצירת חשבון</h1>
      <p className="text-blue-200 text-sm mb-8">הצטרף למשפחת Family Hub</p>

      <form onSubmit={submit} className="w-full max-w-sm space-y-4">
        {error && (
          <div className="bg-red-500/20 border border-red-400/40 text-red-100 text-sm rounded-xl px-4 py-3 text-center">
            {error}
          </div>
        )}

        {/* Avatar picker */}
        <div className="flex justify-center">
          <button type="button" onClick={() => fileRef.current?.click()} className="relative group">
            <div className="w-20 h-20 rounded-full bg-white/20 ring-4 ring-white/30 flex items-center justify-center overflow-hidden">
              {preview
                ? <img src={preview} className="w-full h-full object-cover" alt="" />
                : <span className="text-3xl">👤</span>}
            </div>
            <div className="absolute inset-0 rounded-full bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <span className="text-white text-xs font-bold">שנה</span>
            </div>
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
        </div>

        {/* Role selector */}
        <div>
          <label className="block text-blue-100 text-sm font-medium mb-2">אני...</label>
          <div className="grid grid-cols-2 gap-3">
            {[
              { value: 'parent', label: 'הורה', emoji: '👨‍👩‍👧', desc: 'מנהל משימות ופרסים' },
              { value: 'child',  label: 'ילד',  emoji: '👦',       desc: 'צובר XP ופרסים' },
            ].map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => set('role', opt.value)}
                className={`flex flex-col items-center gap-1 rounded-2xl px-3 py-3.5 border-2 transition-all ${form.role === opt.value ? 'border-white bg-white/20 scale-105' : 'border-white/20 bg-white/10 hover:bg-white/15'}`}
              >
                <span className="text-2xl">{opt.emoji}</span>
                <span className="text-white font-bold text-sm">{opt.label}</span>
                <span className="text-blue-200 text-[10px] text-center leading-tight">{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-blue-100 text-sm font-medium mb-1.5">שם מלא</label>
          <input type="text" required value={form.name} onChange={e => set('name', e.target.value)}
            placeholder="ישראל ישראלי" className={INPUT_CLS} />
        </div>

        <div>
          <label className="block text-blue-100 text-sm font-medium mb-1.5">אימייל</label>
          <input type="email" required value={form.email} onChange={e => set('email', e.target.value)}
            placeholder="your@email.com" className={INPUT_CLS} />
        </div>

        <div>
          <label className="block text-blue-100 text-sm font-medium mb-1.5">סיסמה</label>
          <input type="password" required value={form.password} onChange={e => set('password', e.target.value)}
            placeholder="לפחות 6 תווים" className={INPUT_CLS} />
        </div>

        <button type="submit" disabled={loading}
          className="w-full bg-white text-blue-700 font-bold py-3.5 rounded-2xl text-base shadow-lg active:scale-95 transition-transform disabled:opacity-60 mt-2">
          {loading ? 'נרשם...' : 'הרשמה'}
        </button>
      </form>

      <p className="text-blue-200 text-sm mt-6">
        יש לך חשבון?{' '}
        <Link to="/login" className="text-white font-bold underline underline-offset-2">
          התחברות
        </Link>
      </p>
    </div>
  )
}
