import { useState } from 'react'
import Header from '../components/layout/Header'
import BottomNav from '../components/layout/BottomNav'
import { useAuth } from '../context/AuthContext'
import { useFamily } from '../context/FamilyContext'

export default function Family() {
  const { user }   = useAuth()
  const { family } = useFamily()
  const [copied, setCopied] = useState(false)

  if (!family) return (
    <div className="min-h-screen bg-[#f0f4f8]">
      <Header />
      <div className="flex items-center justify-center py-32">
        <span className="text-3xl animate-pulse">👨‍👩‍👧‍👦</span>
      </div>
      <BottomNav />
    </div>
  )

  const copyCode = () => {
    navigator.clipboard.writeText(family.invite_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const sorted = [...(family.members || [])].sort((a, b) => (b.score || 0) - (a.score || 0))
  const xpPct  = Math.round((family.xp_current / family.xp_next) * 100)

  return (
    <div className="min-h-screen bg-[#f0f4f8]">
      <Header />
      <main className="page-scroll px-4 max-w-lg mx-auto space-y-5 pb-24">

        {/* Family header card */}
        <div className="bg-gradient-to-l from-blue-700 to-blue-500 rounded-2xl p-5 text-white shadow-md">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center text-3xl">
              👨‍👩‍👧‍👦
            </div>
            <div>
              <h2 className="text-xl font-extrabold">משפחת {family.name}</h2>
              <p className="text-blue-200 text-sm">{family.member_count} חברים · רמה {family.level}</p>
            </div>
          </div>

          {/* XP bar */}
          <div className="bg-white/20 rounded-full h-2 mb-1">
            <div className="bg-white rounded-full h-2 transition-all" style={{ width: `${xpPct}%` }} />
          </div>
          <div className="flex justify-between text-blue-100 text-xs">
            <span>{family.xp_current} XP</span>
            <span>{family.xp_next} XP לרמה {family.level + 1}</span>
          </div>
        </div>

        {/* Invite code */}
        {user?.role === 'admin' && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="text-gray-500 text-sm font-medium mb-3">קוד הזמנה</p>
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-center">
                <span className="text-2xl font-extrabold tracking-[0.2em] text-gray-800 font-mono">
                  {family.invite_code}
                </span>
              </div>
              <button onClick={copyCode}
                className={`px-4 py-3 rounded-xl font-bold text-sm transition-all active:scale-95 ${copied ? 'bg-green-500 text-white' : 'bg-blue-600 text-white'}`}>
                {copied ? '✓ הועתק' : 'העתק'}
              </button>
            </div>
            <p className="text-gray-400 text-xs mt-2 text-center">שתף את הקוד כדי להזמין בני משפחה</p>
          </div>
        )}

        {/* Leaderboard */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <h3 className="font-bold text-gray-800">לוח מובילים 🏆</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {sorted.map((member, idx) => (
              <MemberRow key={member.id} member={member} rank={idx + 1} isMe={member.id === user?.id} />
            ))}
          </div>
        </div>

      </main>
      <BottomNav />
    </div>
  )
}

function MemberRow({ member, rank, isMe }) {
  const MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' }
  const level = Math.floor((member.score || 0) / 100) + 1

  return (
    <div className={`flex items-center gap-3 px-4 py-3 ${isMe ? 'bg-blue-50' : ''}`}>
      <div className="w-8 text-center shrink-0">
        {MEDAL[rank]
          ? <span className="text-xl">{MEDAL[rank]}</span>
          : <span className="text-gray-400 font-bold text-sm">#{rank}</span>}
      </div>

      <div className="w-10 h-10 rounded-full bg-blue-100 ring-2 ring-blue-200 overflow-hidden flex items-center justify-center shrink-0">
        {member.avatar_url
          ? <img src={member.avatar_url} className="w-full h-full object-cover" alt="" />
          : <span className="text-blue-600 font-bold text-base">{member.name?.[0]?.toUpperCase()}</span>}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={`font-semibold text-sm truncate ${isMe ? 'text-blue-700' : 'text-gray-800'}`}>
            {member.name}
          </p>
          {isMe && <span className="text-[10px] bg-blue-100 text-blue-600 font-bold px-1.5 py-0.5 rounded-full shrink-0">אתה</span>}
          {member.role === 'admin' && <span className="text-[10px] bg-amber-100 text-amber-600 font-bold px-1.5 py-0.5 rounded-full shrink-0">מנהל</span>}
        </div>
        <p className="text-gray-400 text-xs">רמה {level}</p>
      </div>

      <div className="text-right shrink-0">
        <p className="font-extrabold text-gray-800 text-sm">{member.score || 0}</p>
        <p className="text-gray-400 text-xs">נקודות</p>
      </div>
    </div>
  )
}
