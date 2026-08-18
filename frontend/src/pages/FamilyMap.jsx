import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GoogleMap, MarkerF, useJsApiLoader } from '@react-google-maps/api'
import Header from '../components/layout/Header'
import BottomNav from '../components/layout/BottomNav'
import { useAuth } from '../context/AuthContext'
import { useFamily } from '../context/FamilyContext'
import api from '../api/client'

const RING_COOLDOWN_MS = 30_000

function useRingPhone() {
  const [ringing, setRinging]   = useState(null)  // user_id being rung
  const [ringDone, setRingDone] = useState({})     // { [user_id]: timestamp }

  const [ringMsg, setRingMsg] = useState(null) // { text, ok }

  const ring = useCallback(async (userId) => {
    setRinging(userId)
    setRingMsg(null)
    try {
      const res = await api.post(`/api/notifications/ring/${userId}`)
      setRingDone(d => ({ ...d, [userId]: Date.now() }))
      if (res.data.sent === 0) {
        setRingMsg({ text: 'הטלפון לא מחובר להתראות — על הילד לפתוח את האפ ולאשר התראות', ok: false })
      } else {
        setRingMsg({ text: 'הצלצול נשלח!', ok: true })
        setTimeout(() => setRingMsg(null), 3000)
      }
    } catch {
      setRingMsg({ text: 'שגיאה בשליחה', ok: false })
    } finally {
      setRinging(null)
    }
  }, [])

  const canRing = useCallback((userId) => {
    const last = ringDone[userId] || 0
    return Date.now() - last > RING_COOLDOWN_MS
  }, [ringDone])

  const cooldownLeft = useCallback((userId) => {
    const last = ringDone[userId] || 0
    const left = RING_COOLDOWN_MS - (Date.now() - last)
    return left > 0 ? Math.ceil(left / 1000) : 0
  }, [ringDone])

  return { ring, ringing, ringMsg, canRing, cooldownLeft }
}

const MAP_CONTAINER_STYLE = { width: '100%', height: '100%' }
const DEFAULT_CENTER      = { lat: 32.0853, lng: 34.7818 }
const MAP_OPTIONS = { streetViewControl: false, mapTypeControl: false, fullscreenControl: false }
const REFRESH_MS  = 30_000
const CHILD_COLORS = ['#2563eb', '#16a34a', '#dc2626', '#9333ea', '#ea580c', '#0891b2']

function staleness(iso) {
  if (!iso) return 'none'
  const min = (Date.now() - new Date(iso).getTime()) / 60000
  if (min < 15) return 'fresh'
  if (min < 60) return 'warn'
  return 'stale'
}

function timeAgo(iso) {
  if (!iso) return null
  const sec = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (sec < 60) return 'עכשיו'
  const min = Math.round(sec / 60)
  if (min < 60) return `לפני ${min} דק'`
  const hrs = Math.round(min / 60)
  if (hrs < 24) return `לפני ${hrs} שע'`
  return `לפני ${Math.round(hrs / 24)} ימים`
}

const S = {
  fresh: { dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', ring: 'ring-emerald-200 dark:ring-emerald-800' },
  warn:  { dot: 'bg-amber-400',   text: 'text-amber-600 dark:text-amber-400',     ring: 'ring-amber-200 dark:ring-amber-800'   },
  stale: { dot: 'bg-gray-400',    text: 'text-gray-400',                           ring: 'ring-gray-200 dark:ring-gray-600'     },
  none:  { dot: 'bg-gray-300',    text: 'text-gray-400',                           ring: 'ring-gray-200 dark:ring-gray-600'     },
}

export default function FamilyMap() {
  const { user }   = useAuth()
  const { family } = useFamily()
  const isParent   = user?.role === 'admin' || user?.role === 'parent'

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'family-hub-google-maps',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
  })

  const mapRef   = useRef(null)
  const timerRef = useRef(null)

  const [children,    setChildren]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [selected,    setSelected]    = useState(null)
  const [lastRefresh, setLastRefresh] = useState(null)
  const { ring, ringing, ringMsg, canRing, cooldownLeft } = useRingPhone()
  const [, forceUpdate] = useState(0)

  // Tick cooldown display every second
  useEffect(() => {
    const id = setInterval(() => forceUpdate(n => n + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      const res = await api.get('/api/family/locations')
      setChildren(res.data.children || [])
      setLastRefresh(new Date())
    } catch (e) {
      if (!silent) setError(e.response?.data?.message || 'לא ניתן לטעון מיקומים כרגע')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => { if (isParent) load() }, [isParent, load])

  useEffect(() => {
    if (!isParent) return
    const startTimer = () => {
      timerRef.current = setInterval(() => {
        if (!document.hidden) load(true)
      }, REFRESH_MS)
    }
    const onVisibility = () => {
      if (document.hidden) clearInterval(timerRef.current)
      else { load(true); startTimer() }
    }
    startTimer()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(timerRef.current)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [isParent, load])

  const located   = useMemo(() => children.filter(c => c.lat != null && c.lng != null), [children])
  const unlocated = useMemo(() => children.filter(c => c.lat == null || c.lng == null), [children])

  const fitBounds = useCallback(() => {
    if (!mapRef.current || !window.google || located.length === 0) return
    if (located.length === 1) {
      mapRef.current.panTo({ lat: located[0].lat, lng: located[0].lng })
      mapRef.current.setZoom(15)
      return
    }
    const bounds = new window.google.maps.LatLngBounds()
    located.forEach(c => bounds.extend({ lat: c.lat, lng: c.lng }))
    mapRef.current.fitBounds(bounds, 60)
  }, [located])

  useEffect(() => { if (isLoaded && located.length > 0) fitBounds() }, [isLoaded, fitBounds])

  const focusChild = useCallback((child) => {
    setSelected(child)
    if (mapRef.current && child.lat != null) {
      mapRef.current.panTo({ lat: child.lat, lng: child.lng })
      mapRef.current.setZoom(16)
    }
  }, [])

  if (!isParent) {
    return (
      <div className="min-h-screen bg-[#f0f4f8] dark:bg-gray-900">
        <Header />
        <main className="page-scroll px-4 max-w-lg mx-auto flex flex-col items-center justify-center py-24 text-center">
          <span className="text-4xl mb-3">🔒</span>
          <p className="text-gray-500 dark:text-gray-400 text-sm">מסך זה זמין להורים בלבד</p>
        </main>
        <BottomNav />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f0f4f8] dark:bg-gray-900" dir="rtl">
      <Header />
      <main className="page-scroll px-4 max-w-lg mx-auto space-y-4 pb-24">

        <div className="flex items-center justify-between pt-2">
          <div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-white">מיקום המשפחה 🗺️</h2>
            {lastRefresh && (
              <p className="text-xs text-gray-400 mt-0.5">עודכן {timeAgo(lastRefresh.toISOString())} · מתרענן כל 30 שנ'</p>
            )}
          </div>
          <button onClick={() => load()} disabled={loading}
            className="flex items-center gap-1.5 bg-blue-600 text-white text-xs font-bold px-3.5 py-2 rounded-xl active:scale-95 transition-transform disabled:opacity-50">
            <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {loading ? 'מרענן...' : 'רענון'}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-2.5 text-red-600 dark:text-red-400 text-sm text-center">{error}</div>
        )}

        {!family && !loading && (
          <p className="text-gray-400 text-sm text-center py-10">אין משפחה מקושרת</p>
        )}

        {family && !loading && children.length === 0 && !error && (
          <div className="text-center py-14">
            <p className="text-4xl mb-3">📍</p>
            <p className="text-gray-600 dark:text-gray-300 font-semibold text-sm">אין ילדים עם שיתוף מיקום פעיל</p>
            <p className="text-gray-400 text-xs mt-1">כשילד יפעיל שיתוף מיקום — הוא יופיע כאן</p>
          </div>
        )}

        {children.length > 0 && (
          <>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden" style={{ height: '360px' }}>
              {loadError && (
                <div className="w-full h-full flex items-center justify-center text-red-500 text-sm px-6 text-center">
                  שגיאה בטעינת המפה — בדוק את מפתח Google Maps
                </div>
              )}
              {!loadError && !isLoaded && (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-3xl animate-pulse">🗺️</span>
                </div>
              )}
              {!loadError && isLoaded && (
                <GoogleMap
                  mapContainerStyle={MAP_CONTAINER_STYLE}
                  center={DEFAULT_CENTER}
                  zoom={13}
                  options={MAP_OPTIONS}
                  onLoad={map => { mapRef.current = map; fitBounds() }}
                >
                  {located.map((child, idx) => (
                    <MarkerF
                      key={child.user_id}
                      position={{ lat: child.lat, lng: child.lng }}
                      label={{
                        text: child.name?.[0]?.toUpperCase() || '?',
                        color: '#ffffff',
                        fontWeight: 'bold',
                        fontSize: '13px',
                      }}
                      icon={{
                        path: window.google.maps.SymbolPath.CIRCLE,
                        scale: 18,
                        fillColor: CHILD_COLORS[idx % CHILD_COLORS.length],
                        fillOpacity: 1,
                        strokeColor: '#ffffff',
                        strokeWeight: 2.5,
                      }}
                      title={child.name}
                      onClick={() => focusChild(child)}
                    />
                  ))}
                </GoogleMap>
              )}
            </div>

            {located.length > 1 && (
              <button onClick={fitBounds}
                className="w-full py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 text-xs font-semibold active:scale-95 transition-transform shadow-sm">
                הצג את כולם במפה
              </button>
            )}

            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50 dark:border-gray-700">
                <h3 className="font-bold text-gray-800 dark:text-white text-sm">
                  {located.length > 0 ? `${located.length} מתוך ${children.length} ילדים משתפים מיקום` : 'אף ילד לא משתף מיקום כרגע'}
                </h3>
              </div>
              <div className="divide-y divide-gray-50 dark:divide-gray-700">
                {located.map((child, idx) => {
                  const st = staleness(child.updated_at)
                  return (
                    <button key={child.user_id} onClick={() => focusChild(child)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-right active:bg-gray-50 dark:active:bg-gray-700/60 transition-colors">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 overflow-hidden ring-2 ${S[st].ring}`}
                        style={{ background: CHILD_COLORS[idx % CHILD_COLORS.length] }}>
                        {child.avatar_url
                          ? <img src={child.avatar_url} className="w-full h-full object-cover" alt="" />
                          : <span className="text-white font-bold text-sm">{child.name?.[0]?.toUpperCase()}</span>}
                      </div>
                      <div className="flex-1 min-w-0 text-right">
                        <p className="font-semibold text-sm text-gray-800 dark:text-white truncate">{child.name}</p>
                        <p className={`text-xs flex items-center gap-1 ${S[st].text}`}>
                          <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${S[st].dot}`} />
                          {st === 'fresh' ? `עודכן ${timeAgo(child.updated_at)}`
                          : st === 'warn'  ? `לא עודכן מזמן · ${timeAgo(child.updated_at)}`
                          :                  `מיקום ישן · ${timeAgo(child.updated_at)}`}
                        </p>
                      </div>
                      <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                  )
                })}
                {unlocated.map(child => (
                  <div key={child.user_id} className="flex items-center gap-3 px-4 py-3 opacity-50">
                    <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0 overflow-hidden ring-2 ring-gray-100 dark:ring-gray-600">
                      {child.avatar_url
                        ? <img src={child.avatar_url} className="w-full h-full object-cover" alt="" />
                        : <span className="text-gray-500 font-bold text-sm">{child.name?.[0]?.toUpperCase()}</span>}
                    </div>
                    <div className="flex-1 min-w-0 text-right">
                      <p className="font-semibold text-sm text-gray-800 dark:text-white truncate">{child.name}</p>
                      <p className="text-gray-400 text-xs">שיתוף מיקום לא פעיל</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {selected && (
          <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setSelected(null)}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <div className="relative bg-white dark:bg-gray-800 rounded-t-3xl w-full max-w-lg p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="absolute top-3 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-gray-200 dark:bg-gray-600" />
              <div className="flex items-center gap-3 mb-4 mt-2">
                <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 shadow"
                  style={{ background: CHILD_COLORS[located.indexOf(selected) % CHILD_COLORS.length] }}>
                  {selected.avatar_url
                    ? <img src={selected.avatar_url} className="w-full h-full object-cover" alt="" />
                    : <span className="w-full h-full flex items-center justify-center text-white font-bold text-lg">{selected.name?.[0]?.toUpperCase()}</span>}
                </div>
                <div>
                  <p className="font-bold text-gray-800 dark:text-white text-lg">{selected.name}</p>
                  <p className={`text-sm ${S[staleness(selected.updated_at)].text}`}>עודכן {timeAgo(selected.updated_at)}</p>
                </div>
              </div>
              {selected.accuracy_m != null && (
                <p className="text-gray-400 text-xs mb-3">דיוק מיקום: ±{Math.round(selected.accuracy_m)} מטר</p>
              )}
              {ringMsg && (
                <div className={`text-xs text-center px-3 py-2 rounded-xl mb-2 ${ringMsg.ok ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'}`}>
                  {ringMsg.text}
                </div>
              )}
              <div className="flex gap-2.5 mb-2">
                <a href={`https://www.google.com/maps/search/?api=1&query=${selected.lat},${selected.lng}`}
                  target="_blank" rel="noreferrer"
                  className="flex-1 py-3 rounded-2xl bg-blue-600 text-white font-bold text-sm flex items-center justify-center gap-1.5 active:scale-95 transition-transform">
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  ניווט
                </a>
                {(() => {
                  const uid   = selected.user_id
                  const busy  = ringing === uid
                  const ok    = canRing(uid)
                  const secs  = cooldownLeft(uid)
                  return (
                    <button
                      onClick={() => ok && !busy && ring(uid)}
                      disabled={busy || !ok}
                      className={`flex-1 py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-1.5 active:scale-95 transition-all
                        ${ok && !busy
                          ? 'bg-emerald-500 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'}`}>
                      <span className="text-base">{busy ? '⏳' : '📳'}</span>
                      {busy ? 'שולח...' : ok ? 'צלצל' : `${secs}s`}
                    </button>
                  )
                })()}
              </div>
              <button onClick={() => setSelected(null)}
                className="w-full py-2.5 rounded-2xl border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 font-semibold text-sm active:scale-95 transition-transform">
                סגור
              </button>
            </div>
          </div>
        )}

      </main>
      <BottomNav />
    </div>
  )
}
