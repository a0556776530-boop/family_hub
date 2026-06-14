import { useCallback, useEffect, useRef, useState } from 'react'
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
  const [moments, setMoments]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [lightbox, setLightbox]     = useState(null) // index
  const [toast, setToast]           = useState(null)
  const [deleting, setDeleting]     = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/api/moments/')
      setMoments(res.data.moments)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const remove = async (id) => {
    setDeleting(id)
    try {
      await api.delete(`/api/moments/${id}`)
      setMoments(prev => prev.filter(m => m.id !== id))
      if (lightbox !== null) setLightbox(null)
      showToast('נמחק')
    } catch {
      showToast('שגיאה במחיקה')
    } finally {
      setDeleting(null)
    }
  }

  const openLightbox = (idx) => setLightbox(idx)
  const closeLightbox = () => setLightbox(null)
  const prevPhoto = () => setLightbox(i => (i > 0 ? i - 1 : moments.length - 1))
  const nextPhoto = () => setLightbox(i => (i < moments.length - 1 ? i + 1 : 0))

  return (
    <div className="min-h-screen bg-gray-950 dark:bg-gray-950">
      <Header />

      <main className="page-scroll pb-24">
        {/* Top bar */}
        <div className="px-4 pt-3 pb-4 flex items-center justify-between max-w-2xl mx-auto">
          <div>
            <h2 className="text-xl font-bold text-white">רגעי המשפחה</h2>
            <p className="text-gray-400 text-xs mt-0.5">{moments.length} זיכרונות</p>
          </div>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold px-4 py-2.5 rounded-2xl active:scale-95 transition-all shadow-lg shadow-blue-900/40">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            הוסף
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-24">
            <span className="text-5xl animate-pulse">📸</span>
          </div>
        ) : moments.length === 0 ? (
          <EmptyState onAdd={() => setShowUpload(true)} />
        ) : (
          <div className="px-2 max-w-2xl mx-auto">
            {/* Masonry 2-col grid */}
            <div className="columns-2 sm:columns-3 gap-2 space-y-0">
              {moments.map((m, idx) => (
                <GalleryCard
                  key={m.id}
                  moment={m}
                  idx={idx}
                  currentUserId={user?.id}
                  onOpen={() => openLightbox(idx)}
                  onDelete={remove}
                  deleting={deleting}
                  isFeatured={idx === 0}
                />
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Lightbox */}
      {lightbox !== null && moments[lightbox] && (
        <Lightbox
          moments={moments}
          index={lightbox}
          currentUserId={user?.id}
          onClose={closeLightbox}
          onPrev={prevPhoto}
          onNext={nextPhoto}
          onDelete={remove}
          deleting={deleting}
        />
      )}

      {/* Upload modal */}
      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onUploaded={(m) => {
            setMoments(prev => [m, ...prev])
            setShowUpload(false)
            showToast('📸 נוסף!')
          }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[200] bg-white text-gray-900 text-sm font-semibold px-5 py-3 rounded-2xl shadow-2xl">
          {toast}
        </div>
      )}

      <BottomNav />
    </div>
  )
}

// ── Gallery Card ──────────────────────────────────────────────────────────────
function GalleryCard({ moment, idx, currentUserId, onOpen, onDelete, deleting, isFeatured }) {
  const canDelete = moment.uploader_id === currentUserId
  const [loaded, setLoaded] = useState(false)

  return (
    <div className={`break-inside-avoid mb-2 relative group rounded-xl overflow-hidden bg-gray-800 cursor-pointer ${isFeatured ? 'col-span-2' : ''}`}
      onClick={onOpen}>
      {/* Skeleton */}
      {!loaded && <div className="w-full bg-gray-800 animate-pulse" style={{ height: isFeatured ? 220 : 140 }} />}
      <img
        src={imgSrc(moment.image_url)}
        alt={moment.caption || ''}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={`w-full object-cover transition-all duration-300 group-active:scale-95 ${loaded ? 'opacity-100' : 'opacity-0 absolute inset-0'}`}
        style={{ minHeight: isFeatured ? 200 : 120 }}
      />
      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity" />
      {isFeatured && (
        <div className="absolute top-2 right-2 bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
          ✨ חדש
        </div>
      )}
      {/* Caption overlay */}
      {moment.caption && (
        <div className="absolute bottom-0 inset-x-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <p className="text-white text-[11px] font-medium line-clamp-2">{moment.caption}</p>
        </div>
      )}
      {/* Delete */}
      {canDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(moment.id) }}
          disabled={deleting === moment.id}
          className="absolute top-2 left-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 hover:bg-red-500 transition-all active:scale-90">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}

// ── Lightbox ──────────────────────────────────────────────────────────────────
function Lightbox({ moments, index, currentUserId, onClose, onPrev, onNext, onDelete, deleting }) {
  const m = moments[index]
  const canDelete = m?.uploader_id === currentUserId
  const startX = useRef(null)

  const onTouchStart = (e) => { startX.current = e.touches[0].clientX }
  const onTouchEnd   = (e) => {
    if (startX.current === null) return
    const dx = e.changedTouches[0].clientX - startX.current
    if (dx > 60) onPrev()
    else if (dx < -60) onNext()
    startX.current = null
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') onPrev()
      if (e.key === 'ArrowLeft')  onNext()
      if (e.key === 'Escape')     onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!m) return null

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white active:scale-90 transition-transform">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <span className="text-white/50 text-sm">{index + 1} / {moments.length}</span>
        {canDelete ? (
          <button
            onClick={() => onDelete(m.id)}
            disabled={deleting === m.id}
            className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-red-400 active:scale-90 transition-transform hover:bg-red-500/30">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        ) : <div className="w-10" />}
      </div>

      {/* Image */}
      <div className="flex-1 flex items-center justify-center px-4 relative">
        <button onClick={onPrev} className="absolute right-2 z-10 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white active:scale-90 transition-transform">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <img
          key={m.id}
          src={imgSrc(m.image_url)}
          alt={m.caption || ''}
          className="max-h-[65vh] max-w-full object-contain rounded-2xl shadow-2xl"
        />
        <button onClick={onNext} className="absolute left-2 z-10 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white active:scale-90 transition-transform">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Info */}
      <div className="px-5 py-4 shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
            {m.uploader_name?.[0]?.toUpperCase()}
          </div>
          <span className="text-white font-semibold text-sm">{m.uploader_name?.split(' ')[0]}</span>
          <span className="text-white/40 text-xs">· {timeAgo(m.created_at)}</span>
        </div>
        {m.caption && <p className="text-white/80 text-sm leading-relaxed">{m.caption}</p>}
        {/* Dots */}
        <div className="flex justify-center gap-1.5 mt-4">
          {moments.map((_, i) => (
            <div key={i} className={`rounded-full transition-all ${i === index ? 'w-4 h-1.5 bg-blue-400' : 'w-1.5 h-1.5 bg-white/20'}`} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Upload Modal ──────────────────────────────────────────────────────────────
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
    setLoading(true); setError('')
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
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-gray-900 rounded-t-3xl p-5 pb-10 border-t border-white/10">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-white">רגע חדש 📸</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          <button type="button" onClick={() => fileRef.current?.click()}
            className={`w-full rounded-2xl border-2 border-dashed border-white/20 flex flex-col items-center justify-center gap-2 transition-all overflow-hidden ${preview ? 'h-56 p-0 border-blue-500/50' : 'h-44 hover:border-blue-500/50'}`}>
            {preview
              ? <img src={preview} className="w-full h-full object-cover" alt="" />
              : <>
                  <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center">
                    <svg className="w-7 h-7 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M13.5 12h.008v.008H13.5V12zm-3 6.75h9a2.25 2.25 0 002.25-2.25V8.25a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 18.75z" />
                    </svg>
                  </div>
                  <span className="text-white/50 text-sm">לחץ לבחירת תמונה</span>
                </>}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />

          <input
            value={caption}
            onChange={e => setCaption(e.target.value)}
            placeholder="מה קורה בתמונה? (אופציונלי)"
            maxLength={200}
            className="w-full bg-white/5 border border-white/10 text-white placeholder:text-white/30 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <button type="submit" disabled={loading || !file}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 rounded-2xl active:scale-95 transition-all disabled:opacity-40 shadow-lg shadow-blue-900/40">
            {loading ? 'מעלה...' : 'שתף רגע ✨'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Empty State ───────────────────────────────────────────────────────────────
function EmptyState({ onAdd }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-5 px-6">
      <div className="w-24 h-24 rounded-3xl bg-white/5 flex items-center justify-center">
        <span className="text-5xl">📸</span>
      </div>
      <div className="text-center">
        <p className="font-bold text-white text-xl">עוד אין רגעים כאן</p>
        <p className="text-white/40 text-sm mt-1.5">שתפו את הרגע המשפחתי הראשון!</p>
      </div>
      <button onClick={onAdd}
        className="bg-blue-600 text-white font-bold px-8 py-3.5 rounded-2xl shadow-lg shadow-blue-900/40 active:scale-95 transition-transform">
        העלה תמונה ראשונה
      </button>
    </div>
  )
}
