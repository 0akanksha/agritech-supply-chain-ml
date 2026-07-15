import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

export default function AdminRoute({ children }: { children: ReactNode }) {
  const { currentUser, initializing } = useAuth()

  if (initializing) return null

  if (!currentUser || currentUser.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  return children
}
