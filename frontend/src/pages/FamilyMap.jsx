import { useCallback, useEffect, useMemo, useState } from 'react'
import { GoogleMap, MarkerF, useJsApiLoader } from '@react-google-maps/api'
import Header from '../components/layout/Header'
import BottomNav from '../components/layout/BottomNav'
import { useAuth } from '../context/AuthContext'
import { useFamily } from '../context/FamilyContext'
import api from '../api/client'

const MAP_CONTAINER_STYLE = { width: '100%', height: '100%' }
const DEFAULT_CENTER = { lat: 32.0853, lng: 34.7818 } // Tel Aviv — used only until we have a real fix
const MAP_OPTIONS = { disableDefaultUI: false, streetViewControl: false, mapTypeControl: false, fullscreenControl: false }

function timeAgo(iso) {
  if (!iso) return null
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.round(diffMs / 60000)
  if (min < 1) return 'עכשיו'
  if (min < 60) return `לפני ${min} דק'`
  const hrs = Math.round(min / 60)
  if (hrs < 24) return `לפני ${hrs} שעות`
  return `לפני ${Math.round(hrs / 24)} ימים`
}

export default function FamilyMap() {
  const { user } = useAuth()
  const { family } = useFamily()
  const isParent = user?.role === 'admin' || user?.role === 'parent'

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'family-hub-google-maps',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
  })

  const [children, setChildren] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [selected, setSelected] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/api/family/locations')
      setChildren(res.data.children || [])
    } catch (e) {
      setError(e.response?.data?.message || 'לא ניתן לטעון מיקומים כרגע')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (isParent) load() }, [isParent, load])

  const located   = useMemo(() => children.filter(c => c.lat != null && c.lng != null), [children])
  const unlocated = useMemo(() => children.filter(c => c.lat == null || c.lng == null), [children])

  const center = located[0] ? { lat: located[0].lat, lng: located[0].lng } : DEFAULT_CENTER

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
          <h2 className="text-xl font-bold text-gray-800 dark:text-white">מיקום המשפחה 🗺️</h2>
          <button onClick={load} disabled={loading}
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
          <p className="text-gray-400 text-sm text-center py-10">אין ילדים במשפחה עדיין</p>
        )}

        {located.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden" style={{ height: '360px' }}>
            {loadError && (
              <div className="w-full h-full flex items-center justify-center text-red-500 text-sm px-6 text-center">
                שגיאה בטעינת המפה — יש לוודא שמפתח Google Maps מוגדר כראוי
              </div>
            )}
            {!loadError && !isLoaded && (
              <div className="w-full h-full flex items-center justify-center">
                <span className="text-3xl animate-pulse">🗺️</span>
              </div>
            )}
            {!loadError && isLoaded && (
              <GoogleMap mapContainerStyle={MAP_CONTAINER_STYLE} center={center} zoom={13} options={MAP_OPTIONS}>
                {located.map(child => (
                  <MarkerF
                    key={child.user_id}
                    position={{ lat: child.lat, lng: child.lng }}
                    label={{ text: child.name?.[0]?.toUpperCase() || '👦', className: 'font-bold' }}
                    title={child.name}
                    onClick={() => setSelected(child)}
                  />
                ))}
              </GoogleMap>
            )}
          </div>
        )}

        {(located.length > 0 || unlocated.length > 0) && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50 dark:border-gray-700">
              <h3 className="font-bold text-gray-800 dark:text-white text-sm">ילדים 👨‍👩‍👧‍👦</h3>
            </div>
            <div className="divide-y divide-gray-50 dark:divide-gray-700">
              {located.map(child => (
                <button key={child.user_id} onClick={() => setSelected(child)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-right active:bg-gray-50 dark:active:bg-gray-700/60 transition-colors">
                  <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0 overflow-hidden">
                    {child.avatar_url
                      ? <img src={child.avatar_url} className="w-full h-full object-cover" alt="" />
                      : <span className="text-emerald-600 dark:text-emerald-400 font-bold text-sm">{child.name?.[0]?.toUpperCase()}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-800 dark:text-white truncate">{child.name}</p>
                    <p className="text-emerald-600 dark:text-emerald-400 text-xs">🟢 עודכן {timeAgo(child.updated_at)}</p>
                  </div>
                </button>
              ))}
              {unlocated.map(child => (
                <div key={child.user_id} className="flex items-center gap-3 px-4 py-3 opacity-60">
                  <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0 overflow-hidden">
                    {child.avatar_url
                      ? <img src={child.avatar_url} className="w-full h-full object-cover" alt="" />
                      : <span className="text-gray-500 font-bold text-sm">{child.name?.[0]?.toUpperCase()}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-800 dark:text-white truncate">{child.name}</p>
                    <p className="text-gray-400 text-xs">עדיין אין מיקום</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {selected && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-6" onClick={() => setSelected(null)}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <div className="relative bg-white dark:bg-gray-800 rounded-2xl p-5 w-full max-w-xs text-center shadow-2xl" onClick={e => e.stopPropagation()}>
              <p className="font-bold text-gray-800 dark:text-white text-lg mb-1">{selected.name}</p>
              <p className="text-emerald-600 dark:text-emerald-400 text-sm mb-3">עודכן {timeAgo(selected.updated_at)}</p>
              <p className="text-gray-400 text-xs font-mono">{selected.lat?.toFixed(5)}, {selected.lng?.toFixed(5)}</p>
              <button onClick={() => setSelected(null)}
                className="w-full mt-4 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-sm active:scale-95 transition-transform">
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
