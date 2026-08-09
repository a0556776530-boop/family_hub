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
  const [removing, setRemoving]         = useState(null)
  const [resetTarget, setResetTarget]   = useState(null)
  const [resetPw, setResetPw]           = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError, setResetError]     = useState('')
  const [resetSuccess, setResetSuccess] = useState(false)
  const [editName, setEditName]         = useState(false)
  const [nameVal, setNameVal]       = useState('')
  const [savingName, setSavingName] = useState(false)

  const openReset = (member) => { setResetTarget(member); setResetPw(''); setResetError(''); setResetSuccess(false) }
  const handleReset = async () => {
    if (resetPw.length < 6) return setResetError('הסיסמה חייבת להכיל לפחות 6 תווים')
    setResetLoading(true); setResetError('')
    try {
      await api.post(`/api/family/members/${resetTarget.id}/reset-password`, { new_password: resetPw })
      setResetSuccess(true)
      setTimeout(() => setResetTarget(null), 1500)
    } catch (e) {
      setResetError(e.response?.data?.message || 'שגיאה, נסה שוב')
    } finally { setResetLoading(false) }
  }

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

  const members = family.members || []

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
              <p className="text-blue-200 text-sm">{family.member_count} חברים</p>
            </div>
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

        {/* Members list */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 dark:border-gray-700">
            <h3 className="font-bold text-gray-800 dark:text-white">חברי המשפחה 👨‍👩‍👧‍👦</h3>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-700">
            {members.map(member => (
              <MemberRow key={member.id} member={member} isMe={member.id === user?.id}
                canRemove={(user?.role === 'admin' || user?.role === 'parent') && member.id !== user?.id}
                onRemove={() => removeMember(member.id)}
                removing={removing === member.id}
                canResetPw={(user?.role === 'admin' || user?.role === 'parent') && member.id !== user?.id}
                onResetPw={() => openReset(member)} />
            ))}
          </div>
        </div>

      </main>

      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center px-4 pb-6 sm:pb-0">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setResetTarget(null)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-bold text-gray-800 dark:text-white text-lg mb-1 text-center">איפוס סיסמה 🔑</h3>
            <p className="text-gray-400 text-sm mb-4 text-center">קביעת סיסמה חדשה עבור <strong>{resetTarget.name}</strong></p>
            <input type="password" placeholder="סיסמה חדשה (לפחות 6 תווים)" value={resetPw}
              onChange={e => setResetPw(e.target.value)}
              className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 text-right" />
            {resetError && <p className="text-red-500 text-sm mt-3 bg-red-50 dark:bg-red-900/20 rounded-xl px-3 py-2 text-center">{resetError}</p>}
            {resetSuccess && <p className="text-green-600 text-sm mt-3 bg-green-50 dark:bg-green-900/20 rounded-xl px-3 py-2 text-center">✅ הסיסמה אופסה בהצלחה!</p>}
            <div className="flex gap-3 mt-4">
              <button onClick={() => setResetTarget(null)}
                className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-semibold text-sm active:scale-95 transition-transform">
                ביטול
              </button>
              <button onClick={handleReset} disabled={resetLoading || resetSuccess}
                className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold text-sm active:scale-95 transition-transform disabled:opacity-60">
                {resetLoading ? '...' : 'אפס סיסמה'}
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  )
}

function MemberRow({ member, isMe, canRemove, onRemove, removing, canResetPw, onResetPw }) {
  const roleLabel = member.role === 'parent' ? 'הורה' : 'ילד'
  const roleEmoji = member.role === 'parent' ? '👨‍👩‍👧' : '👦'

  return (
    <div className={`flex items-center gap-3 px-4 py-3 ${isMe ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
      <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 ring-2 ring-blue-200 dark:ring-blue-700 overflow-hidden flex items-center justify-center shrink-0">
        {member.avatar_url
          ? <img src={member.avatar_url} className="w-full h-full object-cover" alt="" />
          : <span className="text-blue-600 dark:text-blue-400 font-bold text-base">{member.name?.[0]?.toUpperCase()}</span>}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={`font-semibold text-sm truncate ${isMe ? 'text-blue-700 dark:text-blue-400' : 'text-gray-800 dark:text-white'}`}>
            {member.name}
          </p>
          {isMe && <span className="text-[10px] bg-blue-100 text-blue-600 font-bold px-1.5 py-0.5 rounded-full shrink-0">אתה</span>}
        </div>
        <p className="text-gray-400 text-xs">{roleEmoji} {roleLabel}</p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {canResetPw && (
          <button onClick={onResetPw}
            className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center text-blue-400 hover:bg-blue-100 active:scale-90 transition-all"
            title="איפוס סיסמה">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </button>
        )}
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
