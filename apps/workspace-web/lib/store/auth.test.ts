import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest'
import { useAuthStore } from './auth'

describe('useAuthStore', () => {
  const resetState = () => {
    useAuthStore.setState({
      user: undefined,
      status: 'idle',
      initialized: false,
      error: undefined,
    })
  }

  let fetchSpy: MockInstance

  beforeEach(() => {
    resetState()
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      ({ ok: true, status: 200, json: async () => ({}) }) as Response,
    )
  })

  afterEach(() => {
    fetchSpy.mockRestore()
    vi.restoreAllMocks()
  })

  it('fetchSession stores authenticated user when API succeeds', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ user: { id: 'u1', name: '测试用户', username: 'demo' } }),
    } as Response)

    await useAuthStore.getState().fetchSession()
    expect(useAuthStore.getState()).toMatchObject({
      status: 'authenticated',
      initialized: true,
      user: { id: 'u1', name: '测试用户', username: 'demo' },
    })
  })

  it('fetchSession marks user as unauthenticated on 401', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => '',
      json: async () => ({})
    } as Response)

    await useAuthStore.getState().fetchSession()
    expect(useAuthStore.getState()).toMatchObject({
      status: 'unauthenticated',
      initialized: true,
      user: undefined,
    })
  })

  it('fetchSession surfaces error message when request fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'server exploded',
      json: async () => ({})
    } as Response)

    await useAuthStore.getState().fetchSession()
    expect(useAuthStore.getState()).toMatchObject({
      status: 'unauthenticated',
      initialized: true,
      error: 'server exploded',
    })
    warnSpy.mockRestore()
  })

  it('logout clears user even if network fails', async () => {
    useAuthStore.setState({
      user: { id: 'u1', name: '测试用户', username: 'demo' },
      status: 'authenticated',
      initialized: true,
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(global.fetch).mockRejectedValue(new Error('network'))

    await useAuthStore.getState().logout()
    expect(useAuthStore.getState()).toMatchObject({
      user: undefined,
      status: 'unauthenticated',
    })
    warnSpy.mockRestore()
  })
})