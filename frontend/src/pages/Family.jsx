import { useState } from 'react'
import Header from '../components/layout/Header'
import BottomNav from '../components/layout/BottomNav'
import { useAuth } from '../context/AuthContext'
import { useFamily } from '../context/FamilyContext'
import api from '../api/client'

export default function Family() {
  const { user }         = useAuth()
  const { family, refreshFamily } = useFamily()
  const [copied, setCopied]         = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [removing, setRemoving]     = useState(null)
  const [editName, setEditName]     = useState(false)
  const [nameVal, setNameVal]       = useState('')
  const [savingName, setSavingName] = useState(false)

  const removeMember = async (memberId) => {
    if (!confirm('להסיר את החבר מהמשפחה?')) return
    setRemoving(memberId)
    try {
      await api.delete(`/api/family/members/${memberId}`)
      await refreshFamily()
    } catch (e) {
      alert(e.response?.data?.message || 'שגיאה')
    } finally { setRemoving(null) }
  }

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

  const openEditName = () => { setNameVal(family.name); setEditName(true) }
  const saveName = async () => {
    if (!nameVal.trim()) return
    setSavingName(true)
    try {
      await api.patch('/api/family/rename', { name: nameVal.trim() })
      await refreshFamily()
      setEditName(false)
    } catch (e) {
      alert(e.response?.data?.message || 'שגיאה')
    } finally { setSavingName(false) }
  }

  const copyLink = () => {
    const link = `${window.location.origin}/join/${family.invite_code}`
    navigator.clipboard.writeText(link)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2000)
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
            <div className="flex-1">
              {editName ? (
                <div className="flex items-center gap-2">
                  <input autoFocus value={nameVal} onChange={e => setNameVal(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && saveName()}
                    className="bg-white/20 text-white placeholder:text-white/50 rounded-xl px-3 py-1.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-white/50 w-32" />
                  <button onClick={saveName} disabled={savingName}
                    className="bg-white text-blue-600 text-xs font-bold px-3 py-1.5 rounded-xl active:scale-95">
                    {savingName ? '...' : 'שמור'}
                  </button>
                  <button onClick={() => setEditName(false)} className="text-white/60 text-xs">ביטול</button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-extrabold">משפחת {family.name}</h2>
                  {(user?.role === 'admin' || user?.role === 'parent') && (
                    <button onClick={openEditName} className="text-white/60 hover:text-white transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                  )}
                </div>
              )}
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
        {(user?.role === 'admin' || user?.role === 'parent') && (
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
            <button onClick={copyLink}
              className={`w-full mt-3 py-3 rounded-xl font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2 ${copiedLink ? 'bg-green-50 text-green-600 border border-green-200' : 'bg-blue-50 text-blue-600 border border-blue-200'}`}>
              {copiedLink ? (
                <>✓ קישור הועתק!</>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  שתף קישור הזמנה
                </>
              )}
            </button>
          </div>
        )}

        {/* Leaderboard */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <h3 className="font-bold text-gray-800">לוח מובילים 🏆</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {sorted.map((member, idx) => (
              <MemberRow key={member.id} member={member} rank={idx + 1} isMe={member.id === user?.id}
                canRemove={(user?.role === 'admin' || user?.role === 'parent') && member.id !== user?.id}
                onRemove={() => removeMember(member.id)}
                removing={removing === member.id} />
            ))}
          </div>
        </div>

      </main>
      <BottomNav />
    </div>
  )
}

function MemberRow({ member, rank, isMe, canRemove, onRemove, removing }) {
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

      <div className="text-right shrink-0 flex items-center gap-2">
        <div>
          <p className="font-extrabold text-gray-800 text-sm">{member.score || 0}</p>
          <p className="text-gray-400 text-xs">נקודות</p>
        </div>
        {canRemove && (
          <button onClick={onRemove} disabled={removing}
            className="w-7 h-7 rounded-full bg-red-50 flex items-center justify-center text-red-400 hover:bg-red-100 active:scale-90 transition-all">
            {removing
              ? <span className="text-xs">...</span>
              : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>}
          </button>
        )}
      </div>
    </div>
  )
}
