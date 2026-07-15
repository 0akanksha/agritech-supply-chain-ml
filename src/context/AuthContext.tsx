import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { ApiError, fetchCurrentUser, login as loginRequest, logout as logoutRequest, signup as signupRequest } from '@/lib/api'
import type { User } from '@/types'

interface SignupInput {
  fullName: string
  email: string
  password: string
}

type AuthResult = { ok: true } | { ok: false; error: string }

interface AuthContextValue {
  currentUser: User | null
  initializing: boolean
  signup: (input: SignupInput) => Promise<AuthResult>
  login: (email: string, password: string) => Promise<AuthResult>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [initializing, setInitializing] = useState(true)

  useEffect(() => {
    fetchCurrentUser()
      .then(({ user }) => setCurrentUser(user))
      .catch(() => setCurrentUser(null))
      .finally(() => setInitializing(false))
  }, [])

  const signup: AuthContextValue['signup'] = async (input) => {
    try {
      const { user } = await signupRequest(input)
      setCurrentUser(user)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof ApiError ? err.message : 'Something went wrong.' }
    }
  }

  const login: AuthContextValue['login'] = async (email, password) => {
    try {
      const { user } = await loginRequest({ email, password })
      setCurrentUser(user)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof ApiError ? err.message : 'Something went wrong.' }
    }
  }

  const logout = async () => {
    await logoutRequest()
    setCurrentUser(null)
  }

  return (
    <AuthContext.Provider value={{ currentUser, initializing, signup, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
