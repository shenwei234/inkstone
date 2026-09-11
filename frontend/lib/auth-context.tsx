'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  clearTokens,
  fetchMe,
  getAccessToken,
  login as apiLogin,
  register as apiRegister,
  saveTokens,
} from './api'
import type { TokenPair, User } from './types'

interface AuthContextValue {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<User>
  register: (email: string, username: string, password: string) => Promise<User>
  logout: () => void
  applyTokens: (token: TokenPair, user: User) => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const token = getAccessToken()
    if (!token) {
      // Defer to avoid sync setState in effect body.
      const t = setTimeout(() => {
        if (!cancelled) setLoading(false)
      }, 0)
      return () => clearTimeout(t)
    }
    fetchMe()
      .then((res) => {
        if (!cancelled) setUser(res.user)
      })
      .catch(() => {
        if (!cancelled) clearTokens()
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const applyTokens = useCallback((token: TokenPair, nextUser: User) => {
    saveTokens(token.access_token, token.refresh_token)
    setUser(nextUser)
  }, [])

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await apiLogin(email, password)
      applyTokens(res.token, res.user)
      return res.user
    },
    [applyTokens],
  )

  const register = useCallback(
    async (email: string, username: string, password: string) => {
      const res = await apiRegister(email, username, password)
      applyTokens(res.token, res.user)
      return res.user
    },
    [applyTokens],
  )

  const logout = useCallback(() => {
    clearTokens()
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, loading, login, register, logout, applyTokens }),
    [user, loading, login, register, logout, applyTokens],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
