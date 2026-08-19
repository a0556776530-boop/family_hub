import { useCallback, useEffect, useRef, useState } from 'react'
import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import api from '../api/client'

const BackgroundGeolocation = registerPlugin('BackgroundGeolocation')

const DEVICE_ID_KEY   = 'fh_device_id'
const MIN_INTERVAL_MS = 2 * 60 * 1000 // min 2 minutes between server updates

function getDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

// Android throttles WebView-originated fetch/XHR ~5 min after the app is backgrounded,
// which would silently break axios-based reporting whenever the child's phone is asleep.
// Native builds go through Capacitor's native HTTP bridge instead, which isn't affected.
async function postLocationUpdate(payload) {
  if (Capacitor.isNativePlatform()) {
    const token   = localStorage.getItem('fh_token')
    const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5000'
    await CapacitorHttp.post({
      url: `${baseURL}/api/location/update`,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      data: payload,
    })
  } else {
    await api.post('/api/location/update', payload)
  }
}

/**
 * status: 'idle' | 'requesting' | 'active' | 'denied' | 'unsupported' | 'error'
 */
export function useLocationTracking(user) {
  const [status, setStatus] = useState('idle')
  const [error, setError]   = useState('')
  const watcherId  = useRef(null)
  const lastSentAt = useRef(0)
  const deviceId   = useRef(getDeviceId())

  const sendPosition = useCallback((lat, lng, accuracy_m, capturedAt) => {
    const now = Date.now()
    if (now - lastSentAt.current < MIN_INTERVAL_MS) return
    lastSentAt.current = now
    const payload = {
      device_id:   deviceId.current,
      lat, lng, accuracy_m,
      captured_at: capturedAt || new Date().toISOString(),
    }
    // Retry once after 15 s — handles Render cold-start waking up
    postLocationUpdate(payload).catch(() => {
      setTimeout(() => postLocationUpdate(payload).catch(() => {}), 15000)
    })
  }, [])

  const stop = useCallback(async () => {
    if (Capacitor.isNativePlatform()) {
      if (watcherId.current) {
        try { await BackgroundGeolocation.removeWatcher({ id: watcherId.current }) } catch { /* watcher already gone */ }
      }
    } else if (watcherId.current != null) {
      navigator.geolocation.clearWatch(watcherId.current)
    }
    watcherId.current = null
    setStatus('idle')
  }, [])

  const start = useCallback(async () => {
    if (!user) return
    setStatus('requesting')
    setError('')

    try {
      const platform = Capacitor.isNativePlatform() ? Capacitor.getPlatform() : 'web'
      await api.post('/api/location/devices/register', { device_id: deviceId.current, platform })

      if (Capacitor.isNativePlatform()) {
        if (platform === 'android') {
          // Android 13+ requires an explicit runtime grant for the persistent tracking
          // notification a background location service must show; best-effort only —
          // background tracking still starts even if this is denied.
          try { await LocalNotifications.requestPermissions() } catch { /* non-fatal */ }
        }

        const id = await BackgroundGeolocation.addWatcher(
          {
            backgroundTitle:   'עוזר המשפחה עוקב אחרי המיקום שלך',
            backgroundMessage: 'כדי לשתף את המיקום שלך עם ההורים. הקש כדי לבטל.',
            requestPermissions: true,
            stale: false,
            distanceFilter: 100, // meters — movement-triggered sampling, not continuous polling
          },
          (location, err) => {
            if (err) {
              setStatus(err.code === 'NOT_AUTHORIZED' ? 'denied' : 'error')
              if (err.code !== 'NOT_AUTHORIZED') setError(err.message || 'שגיאת מיקום')
              return
            }
            if (location) {
              sendPosition(location.latitude, location.longitude, location.accuracy, new Date(location.time).toISOString())
              setStatus('active')
            }
          }
        )
        watcherId.current = id
        setStatus('active')
      } else {
        if (!('geolocation' in navigator)) { setStatus('unsupported'); return }

        // Fire an immediate low-accuracy position first so the parent sees a
        // fresh location right away, before the high-accuracy GPS fix arrives.
        navigator.geolocation.getCurrentPosition(
          pos => {
            sendPosition(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy)
            setStatus('active')
          },
          () => {}, // ignore — watchPosition below handles persistent errors
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
        )

        const id = navigator.geolocation.watchPosition(
          pos => {
            sendPosition(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy)
            setStatus('active')
          },
          err => {
            setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'error')
            setError(err.message)
          },
          { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 }
        )
        watcherId.current = id
        setStatus('active')
      }
    } catch (e) {
      setStatus('error')
      setError(e?.response?.data?.message || e?.message || 'שגיאה בהפעלת המעקב')
    }
  }, [user, sendPosition])

  // When the app comes back to foreground, immediately get and send current position.
  // On web: watchPosition stops firing in background tabs. On native: the background watcher
  // only fires on movement (distanceFilter), so a stationary child never refreshes unless
  // the app is opened — we force a fix here to keep the parent map current.
  useEffect(() => {
    if (!user) return
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (!('geolocation' in navigator)) return
      if (watcherId.current == null) return
      lastSentAt.current = 0 // bypass throttle — position may be stale after backgrounding
      navigator.geolocation.getCurrentPosition(
        pos => sendPosition(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
        () => {},
        { enableHighAccuracy: Capacitor.isNativePlatform(), timeout: 10000, maximumAge: 30000 }
      )
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [user, sendPosition])

  // Stop any live watcher on unmount so it never outlives the component that started it.
  useEffect(() => {
    return () => { if (watcherId.current != null) stop() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { status, error, start, stop }
}
