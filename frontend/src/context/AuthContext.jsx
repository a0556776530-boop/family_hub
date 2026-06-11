import { createContext, useContext, useState, useEffect } from 'react'
import api from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('fh_token')
    if (!token) { setLoading(false); return }
    api.get('/api/auth/me')
      .then(res => setUser(res.data.user))
      .catch(() => localStorage.removeItem('fh_token'))
      .finally(() => setLoading(false))
  }, [])

  const login = async (email, password) => {
    const res = await api.post('/api/auth/login', { email, password })
    localStorage.setItem('fh_token', res.data.token)
    setUser(res.data.user)
    return res.data.user
  }

  const register = async (formData) => {
    const res = await api.post('/api/auth/register', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    localStorage.setItem('fh_token', res.data.token)
    setUser(res.data.user)
    return res.data.user
  }

  const logout = () => {
    localStorage.removeItem('fh_token')
    setUser(null)
  }

  const refreshUser = async () => {
    const res = await api.get('/api/auth/me')
    setUser(res.data.user)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
