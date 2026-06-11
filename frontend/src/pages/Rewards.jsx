import { useEffect, useState } from 'react'
import Header from '../components/layout/Header'
import BottomNav from '../components/layout/BottomNav'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useConfetti } from '../components/Confetti'

const REWARD_EMOJIS = ['🎮', '🍕', '🎬', '🛒', '⚽', '🎨', '🎵', '🍦', '📱', '✈️', '🎁', '💰']

export default function Rewards() {
  const { user, refreshUser } = useAuth()
  const confetti = useConfetti()
  const isParent = user?.role === 'parent'

  const [rewards, setRewards]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [toast, setToast]       = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get('/api/rewards/')
      setRewards(res.data.rewards)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const redeem = async (reward) => {
    try {
      const res = await api.post(`/api/rewards/${reward.id}/redeem`)
      showToast(`🎉 ${res.data.message}`)
      confetti()
      refreshUser()
      load()
    } catch (err) {
      showToast(err.response?.data?.message || 'שגיאה')
    }
  }

  const remove = async (id) => {
    await api.delete(`/api/rewards/${id}`)
    setRewards(r => r.filter(x => x.id !== id))
  }

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  const balance = user?.wallet_balance ?? 0

  return (
    <div className="min-h-screen bg-[#f0f4f8] dark:bg-gray-900">
      <Header />
      <main className="page-scroll px-4 max-w-lg mx-auto">

        {/* Wallet card */}
        <div className="mt-2 mb-5 bg-gradient-to-l from-violet-600 to-purple-500 dark:from-violet-800 dark:to-purple-700 rounded-2xl p-4 text-white shadow-md">
          <p className="text-purple-200 text-sm font-medium mb-1">הארנק שלך 💰</p>
          <p className="text-4xl font-extrabold">{balance} <span className="text-2xl font-bold text-purple-200">XP</span></p>
          <p className="text-purple-200 text-xs mt-1">השלם משימות כדי לצבור XP ולפדות פרסים</p>
        </div>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-800 dark:text-white">חנות הפרסים 🎁</h2>
          {isParent && (
            <button onClick={() => setShowModal(true)}
              className="bg-purple-600 text-white text-sm font-bold px-4 py-2 rounded-xl active:scale-95 transition-transform shadow-sm">
              + פרס חדש
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><span className="text-3xl animate-pulse">🎁</span></div>
        ) : rewards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <span className="text-5xl">🎁</span>
            <p className="text-gray-500 dark:text-gray-400 font-medium">אין פרסים בחנות עדיין</p>
            {isParent && (
              <button onClick={() => setShowModal(true)}
                className="bg-purple-600 text-white text-sm font-bold px-5 py-2.5 rounded-xl active:scale-95 transition-transform">
                הוסף פרס ראשון
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 pb-24">
            {rewards.map(r => (
              <RewardCard key={r.id} reward={r} balance={balance} isParent={isParent}
                onRedeem={() => redeem(r)} onDelete={() => remove(r.id)} />
            ))}
          </div>
        )}
      </main>

      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-gray-900 dark:bg-white dark:text-gray-900 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl text-center max-w-xs">
          {toast}
        </div>
      )}

      {showModal && (
        <AddRewardModal
          onClose={() => setShowModal(false)}
          onSaved={(r) => { setShowModal(false); setRewards(prev => [...prev, r]) }}
        />
      )}

      <BottomNav />
    </div>
  )
}

function RewardCard({ reward, balance, isParent, onRedeem, onDelete }) {
  const canAfford  = balance >= reward.cost
  const affordable = !isParent && canAfford

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 flex flex-col items-center gap-2 relative ${!canAfford && !isParent ? 'opacity-60' : ''}`}>
      {isParent && (
        <button onClick={onDelete}
          className="absolute top-2 left-2 text-gray-300 dark:text-gray-600 hover:text-red-400 transition-colors p-1">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      <span className="text-4xl">{reward.emoji}</span>
      <p className="font-bold text-gray-800 dark:text-white text-sm text-center leading-tight">{reward.title}</p>
      <div className="flex items-center gap-1 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 px-2.5 py-1 rounded-full">
        <span className="text-xs font-extrabold">{reward.cost}</span>
        <span className="text-[10px] font-medium">XP</span>
      </div>

      {!isParent && (
        <button
          onClick={onRedeem}
          disabled={!canAfford}
          className={`w-full py-2 rounded-xl text-sm font-bold transition-all active:scale-95 mt-1 ${affordable ? 'bg-purple-600 text-white shadow-sm' : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'}`}>
          {canAfford ? 'פדה! 🎉' : 'חסר XP'}
        </button>
      )}
    </div>
  )
}

function AddRewardModal({ onClose, onSaved }) {
  const [form, setForm]     = useState({ title: '', cost: 100, emoji: '🎁' })
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.post('/api/rewards/', form)
      onSaved(res.data.reward)
    } catch (err) {
      setError(err.response?.data?.message || 'שגיאה')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-800 rounded-t-3xl p-5 pb-8">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white">פרס חדש</h3>
          <button onClick={onClose} className="text-gray-400 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          {error && <p className="text-red-500 text-sm text-center">{error}</p>}
          <div>
            <label className="block text-gray-600 dark:text-gray-300 text-sm font-medium mb-1.5">שם הפרס</label>
            <input required value={form.title} onChange={e => set('title', e.target.value)}
              placeholder="שעה נוספת מסך, פיצה, ..." className="modal-input dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
          </div>
          <div>
            <label className="block text-gray-600 dark:text-gray-300 text-sm font-medium mb-1.5">מחיר ב-XP: {form.cost}</label>
            <input type="range" min={10} max={1000} step={10} value={form.cost}
              onChange={e => set('cost', +e.target.value)} className="w-full" />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>10 XP</span><span>1000 XP</span>
            </div>
          </div>
          <div>
            <label className="block text-gray-600 dark:text-gray-300 text-sm font-medium mb-2">בחר אמוג'י</label>
            <div className="flex flex-wrap gap-2">
              {REWARD_EMOJIS.map(em => (
                <button key={em} type="button" onClick={() => set('emoji', em)}
                  className={`text-2xl p-2 rounded-xl transition-colors ${form.emoji === em ? 'bg-purple-100 dark:bg-purple-900/40 ring-2 ring-purple-400' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                  {em}
                </button>
              ))}
            </div>
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-purple-600 text-white font-bold py-3 rounded-xl active:scale-95 transition-transform disabled:opacity-60">
            {loading ? 'שומר...' : 'הוסף פרס'}
          </button>
        </form>
      </div>
    </div>
  )
}
