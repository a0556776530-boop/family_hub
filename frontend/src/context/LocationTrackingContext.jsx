import { createContext, useContext, useEffect, useState } from 'react'
import { useLocationTracking } from '../hooks/useLocationTracking'
import { useAuth } from './AuthContext'
import LocationConsentScreen from '../components/LocationConsentScreen'

const CONSENT_KEY = 'fh_location_consent'
const LocationTrackingContext = createContext(null)

// Lives once at the app root so the underlying native watcher survives navigation.
export function LocationTrackingProvider({ children }) {
  const { user } = useAuth()
  const tracking = useLocationTracking(user)
  const [consented, setConsented] = useState(() => localStorage.getItem(CONSENT_KEY) === 'granted')
  const [showConsentScreen, setShowConsentScreen] = useState(false)

  // Show one-time consent screen for children who haven't decided yet.
  // null = never seen it; 'granted' / 'revoked' = already decided.
  useEffect(() => {
    const isChildRole = user?.role === 'child' || user?.role === 'member'
    if (isChildRole && localStorage.getItem(CONSENT_KEY) === null) {
      setShowConsentScreen(true)
    }
  }, [user?.id, user?.role])

  // Re-arm the watcher on every app boot if the user previously opted in.
  useEffect(() => {
    const isChildRole = user?.role === 'child' || user?.role === 'member'
    if (isChildRole && consented && tracking.status === 'idle') {
      tracking.start()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, consented])

  const grant = async () => {
    setShowConsentScreen(false)
    localStorage.setItem(CONSENT_KEY, 'granted')
    setConsented(true)
    await tracking.start()
  }

  const decline = () => {
    setShowConsentScreen(false)
    localStorage.setItem(CONSENT_KEY, 'revoked')
    setConsented(false)
  }

  const revoke = async () => {
    await tracking.stop()
    localStorage.setItem(CONSENT_KEY, 'revoked')
    setConsented(false)
  }

  return (
    <LocationTrackingContext.Provider value={{ ...tracking, consented, grant, revoke }}>
      {showConsentScreen && (
        <LocationConsentScreen onAllow={grant} onDecline={decline} />
      )}
      {children}
    </LocationTrackingContext.Provider>
  )
}

export const useLocationTrackingContext = () => useContext(LocationTrackingContext)
