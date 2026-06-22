'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'

export interface User {
  id: string
  email: string
  tabCount?: number
}

interface AuthState {
  token: string | null
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    if (saved) {
      setToken(saved)
      api.get('/api/auth/me', saved)
        .then(u => setUser(u))
        .catch(() => { localStorage.removeItem('token'); setToken(null) })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.post('/api/auth/login', { email, password })
    localStorage.setItem('token', data.token)
    setToken(data.token)
    setUser(await api.get('/api/auth/me', data.token))
  }, [])

  const register = useCallback(async (email: string, password: string) => {
    const data = await api.post('/api/auth/register', { email, password })
    localStorage.setItem('token', data.token)
    setToken(data.token)
    setUser(await api.get('/api/auth/me', data.token))
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    setToken(null)
    setUser(null)
    router.push('/')
  }, [router])

  return (
    <AuthContext.Provider value={{ token, user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
