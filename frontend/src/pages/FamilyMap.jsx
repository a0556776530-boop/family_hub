import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import Header from '../components/layout/Header'
import BottomNav from '../components/layout/BottomNav'
import { useAuth } from '../context/AuthContext'
import { useFamily } from '../context/FamilyContext'
import api from '../api/client'

// Fix Leaflet default icon broken by bundlers
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const DEFAULT_CENTER = [32.0853, 34.7818]
const REFRESH_MS     = 30_000
const CHILD_COLORS   = ['#2563eb', '#16a34a', '#dc2626', '#9333ea', '#ea580c', '#0891b2']

function makeIcon(color, letter) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:36px;height:36px;border-radius:50%;
      background:${color};border:3px solid #fff;
      box-shadow:0 2px 8px rgba(0,0,0,.3);
      display:flex;align-items:center;justify-content:center;
      color:#fff;font-weight:700;font-size:15px;font-family:sans-serif;
    ">${letter}</div>`,
    iconSize:   [36, 36],
    iconAnchor: [18, 18],
    popupAnchor:[0, -20],
  })
}

function FitBounds({ positions }) {
  const map = useMap()
  useEffect(() => {
    if (!positions || positions.length === 0) return
    if (positions.length === 1) {
      map.setView(positions[0], 15, { animate: true })
    } else {
      map.fitBounds(L.latLngBounds(positions), { padding: [40, 40], animate: true })
    }
  }, [map, positions])
  return null
}

function FlyTo({ target }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.flyTo(target, 16, { duration: 1 })
  }, [map, target])
  return null
}

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
  const timerRef   = useRef(null)

  const [children,    setChildren]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [selected,    setSelected]    = useState(null)
  const [flyTarget,   setFlyTarget]   = useState(null)
  const [lastRefresh, setLastRefresh] = useState(null)

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
      if (document.hidden) {
        clearInterval(timerRef.current)
      } else {
        load(true)
        startTimer()
      }
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
  const positions = useMemo(() => located.map(c => [c.lat, c.lng]), [located])

  const focusChild = useCallback((child) => {
    setSelected(child)
    if (child.lat != null) setFlyTarget([child.lat, child.lng])
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

        {/* Title */}
        <div className="flex items-center justify-between pt-2">
          <div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-white">מיקום המשפחה 🗺️</h2>
            {lastRefresh && (
              <p className="text-xs text-gray-400 mt-0.5">
                עודכן {timeAgo(lastRefresh.toISOString())} · מתרענן כל 30 שנ'
              </p>
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
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-2.5 text-red-600 dark:text-red-400 text-sm text-center">
            {error}
          </div>
        )}

        {!family && !loading && (
          <p className="text-gray-400 text-sm text-center py-10">אין משפחה מקושרת</p>
        )}

        {family && !loading && children.length === 0 && !error && (
          <div className="text-center py-14">
            <p className="text-4xl mb-3">📍</p>
            <p className="text-gray-600 dark:text-gray-300 font-semibold text-sm">אין ילדים עם שיתוף מיקום פעיל</p>
            <p className="text-gray-400 text-xs mt-1 leading-relaxed">
              כשילד יפתח את הפרופיל שלו ויפעיל שיתוף מיקום — הוא יופיע כאן
            </p>
          </div>
        )}

        {children.length > 0 && (
          <>
            {/* Map */}
            <div className="rounded-2xl shadow-sm overflow-hidden" style={{ height: '360px' }}>
              <MapContainer
                center={DEFAULT_CENTER}
                zoom={13}
                style={{ width: '100%', height: '100%' }}
                zoomControl={true}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <FitBounds positions={positions} />
                {flyTarget && <FlyTo target={flyTarget} />}
                {located.map((child, idx) => (
                  <Marker
                    key={child.user_id}
                    position={[child.lat, child.lng]}
                    icon={makeIcon(CHILD_COLORS[idx % CHILD_COLORS.length], child.name?.[0]?.toUpperCase() || '?')}
                    eventHandlers={{ click: () => focusChild(child) }}
                  >
                    <Popup>
                      <div style={{ direction: 'rtl', minWidth: 120 }}>
                        <strong>{child.name}</strong>
                        <br />
                        <span style={{ fontSize: 12, color: '#888' }}>
                          עודכן {timeAgo(child.updated_at)}
                        </span>
                        {child.accuracy_m != null && (
                          <>
                            <br />
                            <span style={{ fontSize: 11, color: '#aaa' }}>
                              דיוק ±{Math.round(child.accuracy_m)}מ'
                            </span>
                          </>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>

            {/* Fit all */}
            {located.length > 1 && (
              <button
                onClick={() => setFlyTarget(null)}
                className="w-full py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 text-xs font-semibold active:scale-95 transition-transform shadow-sm">
                הצג את כולם במפה
              </button>
            )}

            {/* Children list */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50 dark:border-gray-700">
                <h3 className="font-bold text-gray-800 dark:text-white text-sm">
                  {located.length > 0
                    ? `${located.length} מתוך ${children.length} ילדים משתפים מיקום`
                    : 'אף ילד לא משתף מיקום כרגע'}
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

        {/* Selected child bottom sheet */}
        {selected && (
          <div className="fixed inset-0 z-[1000] flex items-end justify-center" onClick={() => setSelected(null)}>
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
                  <p className="font-bold text-gray-800 dark:text-white text-lg leading-tight">{selected.name}</p>
                  <p className={`text-sm ${S[staleness(selected.updated_at)].text}`}>
                    עודכן {timeAgo(selected.updated_at)}
                  </p>
                </div>
              </div>

              {selected.accuracy_m != null && (
                <p className="text-gray-400 text-xs mb-3">דיוק מיקום: ±{Math.round(selected.accuracy_m)} מטר</p>
              )}

              <a
                href={`https://www.google.com/maps/search/?api=1&query=${selected.lat},${selected.lng}`}
                target="_blank"
                rel="noreferrer"
                className="w-full py-3 rounded-2xl bg-blue-600 text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                פתח ב-Google Maps לניווט
              </a>

              <button onClick={() => setSelected(null)}
                className="w-full mt-2 py-2.5 rounded-2xl border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 font-semibold text-sm active:scale-95 transition-transform">
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
