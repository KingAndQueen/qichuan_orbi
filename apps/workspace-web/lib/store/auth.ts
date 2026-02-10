import { createWithEqualityFn } from 'zustand/traditional'

export interface AuthUser {
  id: string
  name: string
  username: string
  avatarUrl?: string
}

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated'

interface AuthState {
  user?: AuthUser
  status: AuthStatus
  initialized: boolean
  error?: string
  fetchSession: (force?: boolean) => Promise<void>
  logout: () => Promise<void>
  login: (provider: string) => Promise<never>
  handleCallback: (provider: string, code: string) => Promise<never>
}

const disabledLoginMessage = '第三方登录暂未开放，请使用账号密码登录。'

export const useAuthStore = createWithEqualityFn<AuthState>((set, get) => ({
  user: undefined,
  status: 'idle',
  initialized: false,
  error: undefined,

  async fetchSession(force = false) {
    const { status, initialized } = get()

    // 避免重复请求
    if (!force && (status === 'loading' || (initialized && status === 'authenticated'))) {
      return
    }

    set({ status: 'loading', error: undefined })

    try {
      const res = await fetch('/api/auth/session', { credentials: 'include' })

      // 会话存在
      if (res.ok) {
        const data = (await res.json()) as { user: AuthUser }
        set({
          user: data.user,
          status: 'authenticated',
          initialized: true,
        })
        return
      }

      // 未登录
      if (res.status === 401) {
        set({
          user: undefined,
          status: 'unauthenticated',
          initialized: true,
        })
        return
      }

      // 其它错误
      const message = await res.text()
      throw new Error(message || '会话校验失败')
    } catch (error) {
      console.warn('Failed to fetch auth session', error)
      set({
        user: undefined,
        status: 'unauthenticated',
        initialized: true,
        error: error instanceof Error ? error.message : '会话校验失败',
      })
    }
  },

  async logout() {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (error) {
      console.warn('Failed to logout', error)
    }

    set({
      user: undefined,
      status: 'unauthenticated',
    })
  },

  async login() {
    throw new Error(disabledLoginMessage)
  },

  async handleCallback() {
    throw new Error(disabledLoginMessage)
  },
}))
