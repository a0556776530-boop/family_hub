import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useFamily } from '../context/FamilyContext'

export default function FamilySetup() {
  const { refreshUser } = useAuth()
  const { createFamily, joinFamily } = useFamily()
  const navigate = useNavigate()

  const [tab, setTab]       = useState('create') // 'create' | 'join'
  const [name, setName]     = useState('')
  const [code, setCode]     = useState('')
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (tab === 'create') {
        await createFamily(name.trim())
      } else {
        await joinFamily(code.trim().toUpperCase())
      }
      await refreshUser()
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.response?.data?.message || 'שגיאה, נסה שנית')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-700 flex flex-col items-center justify-center px-6">
      <div className="text-5xl mb-3">👨‍👩‍👧‍👦</div>
      <h1 className="text-2xl font-extrabold text-white mb-1">הגדרת משפחה</h1>
      <p className="text-blue-200 text-sm mb-8">צור משפחה חדשה או הצטרף לקיימת</p>

      {/* Tabs */}
      <div className="w-full max-w-sm bg-white/15 rounded-2xl p-1 flex mb-6">
        {[['create', 'יצירת משפחה'], ['join', 'הצטרפות']].map(([t, label]) => (
          <button
            key={t}
            onClick={() => { setTab(t); setError('') }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${tab === t ? 'bg-white text-blue-700 shadow' : 'text-white/80'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="w-full max-w-sm space-y-4">
        {error && (
          <div className="bg-red-500/20 border border-red-400/40 text-red-100 text-sm rounded-xl px-4 py-3 text-center">
            {error}
          </div>
        )}

        {tab === 'create' ? (
          <div>
            <label className="block text-blue-100 text-sm font-medium mb-1.5">שם המשפחה</label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="משפחת כהן"
              className="w-full bg-white/15 border border-white/25 text-white placeholder:text-blue-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/50"
            />
          </div>
        ) : (
          <div>
            <label className="block text-blue-100 text-sm font-medium mb-1.5">קוד הזמנה</label>
            <input
              type="text"
              required
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={8}
              className="w-full bg-white/15 border border-white/25 text-white placeholder:text-blue-300 rounded-xl px-4 py-3 text-sm tracking-widest font-mono text-center focus:outline-none focus:ring-2 focus:ring-white/50"
            />
            <p className="text-blue-300 text-xs mt-2 text-center">בקש את הקוד ממנהל המשפחה</p>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-white text-blue-700 font-bold py-3.5 rounded-2xl text-base shadow-lg active:scale-95 transition-transform disabled:opacity-60"
        >
          {loading ? '...' : tab === 'create' ? 'צור משפחה' : 'הצטרף'}
        </button>
      </form>
    </div>
  )
}
