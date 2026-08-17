import { createContext, useContext, useEffect, useState } from 'react'
import { useLocationTracking } from '../hooks/useLocationTracking'
import { useAuth } from './AuthContext'

const CONSENT_KEY = 'fh_location_consent'
const LocationTrackingContext = createContext(null)

// Lives once at the app root (like AuthContext/FamilyContext) so the underlying
// native watcher survives page navigation — a component-local hook instance would
// tear the watcher down the moment the user leaves the settings screen.
export function LocationTrackingProvider({ children }) {
  const { user } = useAuth()
  const tracking = useLocationTracking(user)
  const [consented, setConsented] = useState(() => localStorage.getItem(CONSENT_KEY) === 'granted')

  // Re-arm the watcher on every app boot if the user previously opted in — a native
  // background watcher survives the app being backgrounded, but not a full process kill.
  useEffect(() => {
    if (user?.role === 'child' && consented && tracking.status === 'idle') {
      tracking.start()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, consented])

  const grant = async () => {
    await tracking.start()
    localStorage.setItem(CONSENT_KEY, 'granted')
    setConsented(true)
  }

  const revoke = async () => {
    await tracking.stop()
    localStorage.setItem(CONSENT_KEY, 'revoked')
    setConsented(false)
  }

  return (
    <LocationTrackingContext.Provider value={{ ...tracking, consented, grant, revoke }}>
      {children}
    </LocationTrackingContext.Provider>
  )
}

export const useLocationTrackingContext = () => useContext(LocationTrackingContext)
