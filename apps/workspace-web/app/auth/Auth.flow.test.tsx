import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useAuthStore } from '../../lib/store/auth'

/**
 * Auth Flow Tests - Focus on useAuthStore Logic
 * 
 * These tests verify the core authentication state management,
 * not UI rendering which is fragile and less meaningful.
 * 
 * [OF-FEAT-001] Authentication Flow
 */

describe('Auth Store Logic [OF-FEAT-001]', () => {
  let fetchSpy: any

  beforeEach(() => {
    // Reset store to initial state
    useAuthStore.setState({
      user: undefined,
      status: 'idle',
      initialized: false,
      error: undefined,
    })

    // Mock global fetch
    fetchSpy = vi.spyOn(global, 'fetch')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('fetchSession', () => {
    it('should authenticate user when session API returns 200', async () => {
      const mockUser = { id: 'u1', name: 'Test User', username: 'testuser' }
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ user: mockUser }),
      } as Response)

      await useAuthStore.getState().fetchSession()

      const state = useAuthStore.getState()
      expect(state.user).toEqual(mockUser)
      expect(state.status).toBe('authenticated')
      expect(state.initialized).toBe(true)
      expect(state.error).toBeUndefined()
    })

    it('should handle unauthenticated state when API returns 401', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as Response)

      await useAuthStore.getState().fetchSession()

      const state = useAuthStore.getState()
      expect(state.user).toBeUndefined()
      expect(state.status).toBe('unauthenticated')
      expect(state.initialized).toBe(true)
    })

    it('should handle API errors gracefully', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      } as Response)

      await useAuthStore.getState().fetchSession()

      const state = useAuthStore.getState()
      expect(state.status).toBe('unauthenticated')
      expect(state.initialized).toBe(true)
      expect(state.error).toBeDefined()
    })

    it('should not refetch when already authenticated (avoid duplicate requests)', async () => {
      // Set initial authenticated state
      useAuthStore.setState({
        status: 'authenticated',
        initialized: true,
        user: { id: 'u1', name: 'User', username: 'user' },
      })

      await useAuthStore.getState().fetchSession()

      // Fetch should not be called
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('should force refetch when force=true even if authenticated', async () => {
      // Set initial authenticated state
      useAuthStore.setState({
        status: 'authenticated',
        initialized: true,
        user: { id: 'u1', name: 'User', username: 'user' },
      })

      const newUser = { id: 'u2', name: 'New User', username: 'newuser' }
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user: newUser }),
      } as Response)

      await useAuthStore.getState().fetchSession(true)

      expect(fetchSpy).toHaveBeenCalled()
      expect(useAuthStore.getState().user).toEqual(newUser)
    })
  })

  describe('logout', () => {
    it('should clear user state and call logout API', async () => {
      // Set initial authenticated state
      useAuthStore.setState({
        user: { id: 'u1', name: 'User', username: 'user' },
        status: 'authenticated',
        initialized: true,
      })

      fetchSpy.mockResolvedValueOnce({
        ok: true,
      } as Response)

      await useAuthStore.getState().logout()

      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/auth/logout',
        expect.objectContaining({ method: 'POST' })
      )

      const state = useAuthStore.getState()
      expect(state.user).toBeUndefined()
      expect(state.status).toBe('unauthenticated')
    })

    it('should clear state even if logout API fails', async () => {
      useAuthStore.setState({
        user: { id: 'u1', name: 'User', username: 'user' },
        status: 'authenticated',
      })

      fetchSpy.mockRejectedValueOnce(new Error('Network error'))

      await useAuthStore.getState().logout()

      const state = useAuthStore.getState()
      expect(state.user).toBeUndefined()
      expect(state.status).toBe('unauthenticated')
    })
  })

  describe('Third-party login (disabled)', () => {
    it('should throw error for login attempt', async () => {
      await expect(
        useAuthStore.getState().login('feishu')
      ).rejects.toThrow('第三方登录暂未开放')
    })

    it('should throw error for OAuth callback', async () => {
      await expect(
        useAuthStore.getState().handleCallback('feishu', 'mockcode')
      ).rejects.toThrow('第三方登录暂未开放')
    })
  })
})
