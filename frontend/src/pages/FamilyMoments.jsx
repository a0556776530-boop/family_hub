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

// ── Media display helpers ─────────────────────────────────────────────────────
function MediaThumb({ src, isVideo, alt, minHeight, onLoad }) {
  const [errored, setErrored] = useState(false)

  if (errored) {
    return (
      <div className="w-full flex items-center justify-center bg-gray-800 text-gray-500 text-2xl" style={{ minHeight }}>
        {isVideo ? '🎬' : '🖼️'}
      </div>
    )
  }

  if (isVideo) {
    return (
      <video
        src={src}
        muted playsInline preload="metadata"
        onLoadedMetadata={onLoad}
        onError={() => setErrored(true)}
        className="w-full object-cover"
        style={{ minHeight }}
      />
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onLoad={onLoad}
      onError={() => setErrored(true)}
      className="w-full object-cover"
      style={{ minHeight }}
    />
  )
}

// ── Gallery Card ──────────────────────────────────────────────────────────────
function GalleryCard({ moment, idx, currentUserId, onOpen, onDelete, deleting, isFeatured }) {
  const canDelete = moment.uploader_id === currentUserId
  const [loaded, setLoaded] = useState(false)
  const isVideo = moment.resource_type === 'video'

  return (
    <div className={`break-inside-avoid mb-2 relative group rounded-xl overflow-hidden bg-gray-800 cursor-pointer ${isFeatured ? 'col-span-2' : ''}`}
      onClick={onOpen}>
      {/* Skeleton */}
      {!loaded && <div className="w-full bg-gray-800 animate-pulse" style={{ height: isFeatured ? 220 : 140 }} />}
      <div className={`transition-all duration-300 ${loaded ? 'opacity-100' : 'opacity-0 absolute inset-0'}`}>
        <MediaThumb
          src={imgSrc(moment.image_url)}
          isVideo={isVideo}
          alt={moment.caption || ''}
          minHeight={isFeatured ? 200 : 120}
          onLoad={() => setLoaded(true)}
        />
      </div>
      {/* Video badge */}
      {isVideo && loaded && (
        <div className="absolute top-2 right-2 bg-black/60 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
          ▶ וידאו
        </div>
      )}
      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity" />
      {isFeatured && !isVideo && (
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

      {/* Media */}
      <div className="flex-1 flex items-center justify-center px-4 relative">
        <button onClick={onPrev} className="absolute right-2 z-10 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white active:scale-90 transition-transform">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
        {m.resource_type === 'video' ? (
          <video
            key={m.id}
            src={imgSrc(m.image_url)}
            controls
            playsInline
            className="max-h-[65vh] max-w-full rounded-2xl shadow-2xl"
          />
        ) : (
          <img
            key={m.id}
            src={imgSrc(m.image_url)}
            alt={m.caption || ''}
            className="max-h-[65vh] max-w-full object-contain rounded-2xl shadow-2xl"
          />
        )}
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

// ── In-App Camera ─────────────────────────────────────────────────────────────
function InAppCamera({ onCapture, onClose }) {
  const videoRef  = useRef(null)
  const streamRef = useRef(null)
  const [ready, setReady]   = useState(false)
  const [facing, setFacing] = useState('environment')

  const startCamera = async (facingMode) => {
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => { videoRef.current.play(); setReady(true) }
      }
    } catch {
      onClose()
    }
  }

  useEffect(() => {
    startCamera(facing)
    return () => streamRef.current?.getTracks().forEach(t => t.stop())
  }, [facing])

  const capture = () => {
    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width  = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    canvas.toBlob(blob => {
      const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' })
      streamRef.current?.getTracks().forEach(t => t.stop())
      onCapture(file, URL.createObjectURL(blob))
    }, 'image/jpeg', 0.92)
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <button onClick={() => { streamRef.current?.getTracks().forEach(t => t.stop()); onClose() }}
          className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <button onClick={() => setFacing(f => f === 'environment' ? 'user' : 'environment')}
          className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white text-xl">
          🔄
        </button>
      </div>

      <div className="flex-1 relative overflow-hidden">
        <video ref={videoRef} playsInline muted autoPlay
          className="w-full h-full object-cover" />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-white text-lg animate-pulse">פותח מצלמה...</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center py-8">
        <button onClick={capture} disabled={!ready}
          className="w-20 h-20 rounded-full bg-white border-4 border-white/40 active:scale-90 transition-transform disabled:opacity-40 shadow-2xl" />
      </div>
    </div>
  )
}

// ── Upload Modal ──────────────────────────────────────────────────────────────
function UploadModal({ onClose, onUploaded }) {
  const fileRef   = useRef(null)
  const [file, setFile]         = useState(null)
  const [preview, setPreview]   = useState(null)
  const [caption, setCaption]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [showCam, setShowCam]   = useState(false)

  const onFile = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  const onCapture = (f, url) => {
    setFile(f)
    setPreview(url)
    setShowCam(false)
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
      setError(err.response?.data?.message || err.message || `שגיאה בהעלאה (${err.response?.status || 'network'})`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {showCam && <InAppCamera onCapture={onCapture} onClose={() => setShowCam(false)} />}

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

            {preview ? (
              <div className="relative w-full rounded-2xl h-56 overflow-hidden bg-black">
                {file?.type?.startsWith('video') ? (
                  <video src={preview} controls playsInline className="w-full h-full object-contain" />
                ) : (
                  <img src={preview} className="w-full h-full object-cover" alt="" />
                )}
                <button type="button" onClick={() => { setFile(null); setPreview(null) }}
                  className="absolute top-2 left-2 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center text-white">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setShowCam(true)}
                  className="rounded-2xl border-2 border-dashed border-white/20 h-32 flex flex-col items-center justify-center gap-2 hover:border-blue-500/50 transition-all active:scale-95">
                  <span className="text-3xl">📷</span>
                  <span className="text-white/60 text-sm font-medium">צלם עכשיו</span>
                </button>
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="rounded-2xl border-2 border-dashed border-white/20 h-32 flex flex-col items-center justify-center gap-2 hover:border-blue-500/50 transition-all active:scale-95">
                  <span className="text-3xl">🖼️</span>
                  <span className="text-white/60 text-sm font-medium">מהגלריה</span>
                </button>
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={onFile} />

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
    </>
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
