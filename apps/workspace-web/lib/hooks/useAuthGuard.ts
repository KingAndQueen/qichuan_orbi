"use client"

import { useEffect } from 'react'
import { useAuthStore } from '../store/auth'

export function useAuthGuard() {
  const { user, status, fetchSession, logout } = useAuthStore((state) => ({
    user: state.user,
    status: state.status,
    fetchSession: state.fetchSession,
    logout: state.logout,
  }))

  // 初始化时自动获取 session（替代 loadFromStorage）
  useEffect(() => {
    void fetchSession()
  }, [fetchSession])

  // 未登录则跳转到 /site-login
  useEffect(() => {
    if (typeof window === 'undefined') return

    if (status === 'unauthenticated') {
      try {
        window.location.replace('/site-login')
      } catch (err) {
        console.warn('Failed to redirect to /site-login', err)
      }
    }
  }, [status])

  return { user, status, logout }
}
