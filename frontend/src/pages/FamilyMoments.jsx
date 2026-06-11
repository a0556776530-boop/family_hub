import { useEffect, useRef, useState } from 'react'
import Header from '../components/layout/Header'
import BottomNav from '../components/layout/BottomNav'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000'

function imgSrc(url) {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return `${API}${url}`
}

function timeAgo(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'הרגע'
  if (m < 60) return `לפני ${m} דקות`
  const h = Math.floor(m / 60)
  if (h < 24) return `לפני ${h} שעות`
  const d = Math.floor(h / 24)
  if (d < 7)  return `לפני ${d} ימים`
  return new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })
}

export default function FamilyMoments() {
  const { user }    = useAuth()
  const fileRef     = useRef(null)
  const [moments, setMoments]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [deleting, setDeleting]   = useState(null)
  const [toast, setToast]         = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get('/api/moments/')
      setMoments(res.data.moments)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  const remove = async (id) => {
    setDeleting(id)
    try {
      await api.delete(`/api/moments/${id}`)
      setMoments(prev => prev.filter(m => m.id !== id))
    } catch {
      showToast('שגיאה במחיקה')
    } finally {
      setDeleting(null)
    }
  }

  const featured = moments[0]

  return (
    <div className="min-h-screen bg-[#f0f4f8] dark:bg-gray-900">
      <Header />
      <main className="page-scroll px-4 max-w-lg mx-auto pb-24">

        <div className="pt-2 mb-4 flex items-end justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-white">רגעי המשפחה 📸</h2>
            <p className="text-gray-400 dark:text-gray-500 text-sm">הזיכרונות שלנו במקום אחד</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="bg-blue-600 text-white text-sm font-bold px-4 py-2 rounded-xl shadow-sm active:scale-95 transition-transform"
          >
            + רגע חדש
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <span className="text-4xl animate-pulse">📸</span>
          </div>
        ) : moments.length === 0 ? (
          <EmptyState onAdd={() => setShowModal(true)} />
        ) : (
          <>
            {/* Featured / Photo of the week */}
            {featured && (
              <FeaturedCard moment={featured} currentUserId={user?.id} onDelete={remove} deleting={deleting} />
            )}

            {/* Grid */}
            {moments.length > 1 && (
              <div className="mt-4 columns-2 gap-3">
                {moments.slice(1).map(m => (
                  <MomentCard key={m.id} moment={m} currentUserId={user?.id}
                    onDelete={remove} deleting={deleting} />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-gray-900 dark:bg-white dark:text-gray-900 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl">
          {toast}
        </div>
      )}

      {showModal && (
        <UploadModal
          onClose={() => setShowModal(false)}
          onUploaded={(m) => { setMoments(prev => [m, ...prev]); setShowModal(false); showToast('📸 נוסף!') }}
        />
      )}

      <BottomNav />
    </div>
  )
}

function FeaturedCard({ moment, currentUserId, onDelete, deleting }) {
  const canDelete = moment.uploader_id === currentUserId
  return (
    <div className="relative rounded-3xl overflow-hidden shadow-lg bg-black">
      <img
        src={imgSrc(moment.image_url)}
        alt={moment.caption || 'רגע משפחתי'}
        className="w-full object-cover max-h-72"
        loading="lazy"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
      <div className="absolute bottom-0 inset-x-0 p-4">
        <div className="flex items-center gap-2 mb-1">
          <Avatar name={moment.uploader_name} url={moment.uploader_avatar} size="sm" />
          <span className="text-white text-xs font-semibold">{moment.uploader_name?.split(' ')[0]}</span>
          <span className="text-white/50 text-xs">· {timeAgo(moment.created_at)}</span>
        </div>
        {moment.caption && <p className="text-white text-sm font-medium">{moment.caption}</p>}
      </div>
      <div className="absolute top-3 right-3 bg-white/90 dark:bg-gray-900/90 text-xs font-bold text-blue-600 dark:text-blue-400 px-2.5 py-1 rounded-full shadow">
        ✨ הכי חדש
      </div>
      {canDelete && (
        <button
          onClick={() => onDelete(moment.id)}
          disabled={deleting === moment.id}
          className="absolute top-3 left-3 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-red-500 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}

function MomentCard({ moment, currentUserId, onDelete, deleting }) {
  const canDelete = moment.uploader_id === currentUserId
  return (
    <div className="break-inside-avoid mb-3 relative rounded-2xl overflow-hidden shadow-sm bg-black">
      <img
        src={imgSrc(moment.image_url)}
        alt={moment.caption || ''}
        className="w-full object-cover"
        loading="lazy"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
      <div className="absolute bottom-0 inset-x-0 p-2.5">
        <div className="flex items-center gap-1.5">
          <Avatar name={moment.uploader_name} url={moment.uploader_avatar} size="xs" />
          <span className="text-white text-[10px] font-semibold truncate">{moment.uploader_name?.split(' ')[0]}</span>
        </div>
        {moment.caption && (
          <p className="text-white/90 text-[10px] mt-0.5 line-clamp-2">{moment.caption}</p>
        )}
      </div>
      {canDelete && (
        <button
          onClick={() => onDelete(moment.id)}
          disabled={deleting === moment.id}
          className="absolute top-2 left-2 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-red-500 transition-colors"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}

function Avatar({ name, url, size }) {
  const dim = size === 'xs' ? 'w-4 h-4 text-[8px]' : 'w-6 h-6 text-xs'
  return (
    <div className={`${dim} rounded-full bg-blue-400 overflow-hidden flex items-center justify-center shrink-0`}>
      {url ? <img src={imgSrc(url)} className="w-full h-full object-cover" alt="" />
           : <span className="font-bold text-white">{name?.[0]?.toUpperCase()}</span>}
    </div>
  )
}

function EmptyState({ onAdd }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <span className="text-6xl">📸</span>
      <div className="text-center">
        <p className="font-bold text-gray-700 dark:text-gray-200 text-lg">עוד אין רגעים כאן</p>
        <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">הוסיפו את התמונה המשפחתית הראשונה!</p>
      </div>
      <button onClick={onAdd}
        className="bg-blue-600 text-white font-bold px-6 py-3 rounded-2xl shadow-md active:scale-95 transition-transform">
        + העלה תמונה ראשונה
      </button>
    </div>
  )
}

function UploadModal({ onClose, onUploaded }) {
  const fileRef   = useRef(null)
  const [file, setFile]       = useState(null)
  const [preview, setPreview] = useState(null)
  const [caption, setCaption] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const onFile = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!file) { setError('בחר תמונה'); return }
    setLoading(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('image', file)
      fd.append('caption', caption)
      const res = await api.post('/api/moments/', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      onUploaded(res.data.moment)
    } catch (err) {
      setError(err.response?.data?.message || 'שגיאה בהעלאה')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-800 rounded-t-3xl p-5 pb-10">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white">רגע חדש 📸</h3>
          <button onClick={onClose} className="text-gray-400 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {error && <p className="text-red-500 text-sm text-center">{error}</p>}

          {/* Image picker */}
          <button type="button" onClick={() => fileRef.current?.click()}
            className={`w-full h-48 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-colors ${preview ? 'border-blue-300 p-0 overflow-hidden' : 'border-gray-200 dark:border-gray-600 hover:border-blue-300'}`}>
            {preview
              ? <img src={preview} className="w-full h-full object-cover" alt="" />
              : <>
                  <span className="text-4xl">📷</span>
                  <span className="text-gray-400 text-sm font-medium">לחץ לבחירת תמונה</span>
                </>}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />

          <div>
            <label className="block text-gray-600 dark:text-gray-300 text-sm font-medium mb-1.5">כיתוב (אופציונלי)</label>
            <input
              value={caption}
              onChange={e => setCaption(e.target.value)}
              placeholder="מה קורה בתמונה?"
              maxLength={200}
              className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-800 dark:text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <button type="submit" disabled={loading || !file}
            className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-2xl active:scale-95 transition-transform disabled:opacity-50">
            {loading ? 'מעלה...' : 'שתף רגע 📸'}
          </button>
        </form>
      </div>
    </div>
  )
}
