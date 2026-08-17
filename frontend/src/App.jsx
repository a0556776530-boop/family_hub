import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { FamilyProvider } from './context/FamilyContext'
import { ThemeProvider } from './context/ThemeContext'
import { LocationTrackingProvider } from './context/LocationTrackingContext'
import { usePushNotifications } from './hooks/usePushNotifications'
import AppLock from './components/AppLock'
import api from './api/client'

function useKeepAlive() {
  useEffect(() => {
    api.get('/api/health').catch(() => {})
    const id = setInterval(() => api.get('/api/health').catch(() => {}), 8 * 60 * 1000)
    return () => clearInterval(id)
  }, [])
}

import Splash      from './pages/Splash'
import Login       from './pages/Login'
import Register    from './pages/Register'
import FamilySetup from './pages/FamilySetup'
import Dashboard   from './pages/Dashboard'
import Tasks       from './pages/Tasks'
import Calendar    from './pages/Calendar'
import Shopping    from './pages/Shopping'
import Family      from './pages/Family'
import Profile     from './pages/Profile'
import FamilyBoard    from './pages/FamilyBoard'
import FamilyMoments  from './pages/FamilyMoments'
import AiAssistant    from './pages/AiAssistant'
import FamilyMap      from './pages/FamilyMap'
import JoinViaLink    from './pages/JoinViaLink'
import ForgotPassword from './pages/ForgotPassword'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <Loader />
  if (!user) return <Navigate to="/login" replace />
  if (!user.family_id) return <Navigate to="/family-setup" replace />
  return children
}

function AuthRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <Loader />
  if (user) return <Navigate to={user.family_id ? '/' : '/family-setup'} replace />
  return children
}

function Loader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-blue-600 dark:bg-gray-900">
      <span className="text-5xl animate-pulse">🏠</span>
    </div>
  )
}

function AppRoutes() {
  const { user, loading } = useAuth()
  usePushNotifications(user)
  useKeepAlive()
  if (loading) return <Loader />
  return (
    <Routes>
      <Route path="/splash"       element={<Splash />} />
      <Route path="/login"        element={<AuthRoute><Login /></AuthRoute>} />
      <Route path="/register"     element={<AuthRoute><Register /></AuthRoute>} />
      <Route path="/family-setup" element={user && !user.family_id ? <FamilySetup /> : <Navigate to="/" replace />} />
      <Route path="/"             element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/tasks"        element={<ProtectedRoute><Tasks /></ProtectedRoute>} />
      <Route path="/calendar"     element={<ProtectedRoute><Calendar /></ProtectedRoute>} />
      <Route path="/shopping"     element={<ProtectedRoute><Shopping /></ProtectedRoute>} />
      <Route path="/family"       element={<ProtectedRoute><Family /></ProtectedRoute>} />
      <Route path="/profile"      element={<ProtectedRoute><Profile /></ProtectedRoute>} />
      <Route path="/board"        element={<ProtectedRoute><FamilyBoard /></ProtectedRoute>} />
      <Route path="/moments"      element={<ProtectedRoute><FamilyMoments /></ProtectedRoute>} />
      <Route path="/ai"           element={<ProtectedRoute><AiAssistant /></ProtectedRoute>} />
      <Route path="/family/map"   element={<ProtectedRoute><FamilyMap /></ProtectedRoute>} />
      <Route path="/join/:code"        element={<JoinViaLink />} />
      <Route path="/forgot-password"  element={<ForgotPassword />} />
      <Route path="*"                 element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <FamilyProvider>
            <LocationTrackingProvider>
              <AppLock>
                <AppRoutes />
              </AppLock>
            </LocationTrackingProvider>
          </FamilyProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
