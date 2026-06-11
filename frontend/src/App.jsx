import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { FamilyProvider } from './context/FamilyContext'
import { ThemeProvider } from './context/ThemeContext'

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
import Rewards       from './pages/Rewards'
import FamilyBoard   from './pages/FamilyBoard'
import FamilyMoments from './pages/FamilyMoments'

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
      <Route path="/rewards"      element={<ProtectedRoute><Rewards /></ProtectedRoute>} />
      <Route path="/board"        element={<ProtectedRoute><FamilyBoard /></ProtectedRoute>} />
      <Route path="/moments"      element={<ProtectedRoute><FamilyMoments /></ProtectedRoute>} />
      <Route path="*"             element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <FamilyProvider>
            <AppRoutes />
          </FamilyProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
