import { createContext, useContext, useState, useEffect } from 'react'
import api from '../api/client'
import { useAuth } from './AuthContext'

const FamilyContext = createContext(null)

export function FamilyProvider({ children }) {
  const { user } = useAuth()
  const [family, setFamily]   = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (user?.family_id) fetchFamily()
    else setFamily(null)
  }, [user?.family_id])

  const fetchFamily = async () => {
    setLoading(true)
    try {
      const res = await api.get('/api/family/me')
      setFamily(res.data.family)
    } catch {
      setFamily(null)
    } finally {
      setLoading(false)
    }
  }

  const createFamily = async (name) => {
    const res = await api.post('/api/family/create', { name })
    setFamily(res.data.family)
    return res.data.family
  }

  const joinFamily = async (invite_code) => {
    const res = await api.post('/api/family/join', { invite_code })
    setFamily(res.data.family)
    return res.data.family
  }

  return (
    <FamilyContext.Provider value={{ family, loading, fetchFamily, createFamily, joinFamily }}>
      {children}
    </FamilyContext.Provider>
  )
}

export const useFamily = () => useContext(FamilyContext)
