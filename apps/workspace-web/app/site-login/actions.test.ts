import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { loginAction } from './actions'
import { redirect } from 'next/navigation'

const { setCookieMock, cookiesMock } = vi.hoisted(() => {
  const setCookieMock = vi.fn()
  const cookiesMock = vi.fn(() => ({ set: setCookieMock }))
  return { setCookieMock, cookiesMock }
})

vi.mock('next/headers', () => ({
  cookies: cookiesMock,
}))

describe('loginAction', () => {
  let originalEnv: string | undefined
  let setTimeoutSpy: MockInstance
  let fetchSpy: MockInstance

  beforeEach(() => {
    originalEnv = process.env.SITE_AUTH_SERVICE_URL
    process.env.SITE_AUTH_SERVICE_URL = 'https://auth.test'
    setCookieMock.mockClear()
    cookiesMock.mockClear()
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      ({ ok: true, status: 200, json: async () => ({}) }) as Response,
    )
    setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((handler: TimerHandler, _timeout?: number) => {
      if (typeof handler === 'function') {
        handler()
      }
      return 0 as unknown as ReturnType<typeof setTimeout>
    }) as never)
    vi.mocked(redirect).mockImplementation(((url: string) => {
      throw new Error(`Unexpected redirect to ${url}`)
    }) as never)
  })

  afterEach(() => {
    process.env.SITE_AUTH_SERVICE_URL = originalEnv
    setTimeoutSpy.mockRestore()
    fetchSpy.mockRestore()
    setCookieMock.mockReset()
    cookiesMock.mockReset()
    vi.mocked(redirect).mockReset()
  })

  const buildForm = (identifier: string, password = 'hunter2', next = '/'): FormData => {
    const form = new FormData()
    form.set('identifier', identifier)
    form.set('password', password)
    form.set('next', next)
    return form
  }

  it('returns fallback error when env is missing', async () => {
    process.env.SITE_AUTH_SERVICE_URL = ''
    const result = await loginAction(buildForm('user@example.com'))
    expect(result).toEqual({ success: false, message: '服务器繁忙，请稍后重试' })
  })

  it('returns validation error when identifier or password is missing', async () => {
    const form = new FormData()
    form.set('identifier', '')
    form.set('password', '')
    const result = await loginAction(form)
    expect(result).toEqual({ success: false, message: '账号和密码不能为空' })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('infers identifier types before calling API', async () => {
    const payloads: Array<{ identifierType: string }> = []
    vi.mocked(global.fetch).mockImplementation(async (_url, init) => {
      payloads.push(JSON.parse(String((init as RequestInit).body)))
      return {
        ok: false,
        status: 400,
        json: async () => ({ message: 'error' }),
      } as Response
    })

    await loginAction(buildForm('user@example.com'))
    await loginAction(buildForm('+8613712345678'))
    await loginAction(buildForm('dev-user'))

    expect(payloads.map((p) => p.identifierType)).toEqual(['email', 'phone', 'username'])
  })

  it('sets cookie and redirects on success with sanitized next url', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ token: 'mock-token', jwtToken: 'mock-jwt', expiresInSeconds: 120 }),
    } as Response)

    vi.mocked(redirect).mockImplementation(() => undefined as never)

    const form = buildForm('user@example.com', 'hunter2', 'https://malicious.com')
    await loginAction(form)

    expect(setCookieMock).toHaveBeenCalledWith('site_auth_token', 'mock-token', expect.objectContaining({
      httpOnly: true,
      path: '/',
      maxAge: 120,
      sameSite: 'lax',
    }))
    expect(setCookieMock).toHaveBeenCalledWith('site_auth_jwt', 'mock-jwt', expect.objectContaining({
      httpOnly: true,
      path: '/',
      maxAge: 120,
      sameSite: 'lax',
    }))
    expect(redirect).toHaveBeenCalledWith('/')
  })

  it('skips JWT cookie when backend does not issue one', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ token: 'mock-token', expiresInSeconds: 120, jwtToken: '' }),
    } as Response)

    vi.mocked(redirect).mockImplementation(() => undefined as never)

    await loginAction(buildForm('user@example.com'))

    expect(setCookieMock).toHaveBeenCalledWith('site_auth_token', 'mock-token', expect.any(Object))
    expect(setCookieMock).not.toHaveBeenCalledWith('site_auth_jwt', expect.anything(), expect.anything())
  })

  it('returns locked message when backend responds with locked code', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 423,
      json: async () => ({ code: 'locked' }),
    } as Response)

    const result = await loginAction(buildForm('user@example.com'))
    expect(result).toEqual({ success: false, message: '尝试次数过多，请稍后再试' })
  })

  it('returns disabled message when backend responds with disabled code', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 423,
      json: async () => ({ code: 'disabled' }),
    } as Response)

    const result = await loginAction(buildForm('user@example.com'))
    expect(result).toEqual({ success: false, message: '账号已被禁用，请联系管理员' })
  })

  it('returns backend message when other errors happen', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ message: '账号或密码错误' }),
    } as Response)

    const result = await loginAction(buildForm('user@example.com'))
    expect(result).toEqual({ success: false, message: '账号或密码错误' })
  })

  it('returns busy message when request fails entirely', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error('network'))

    const result = await loginAction(buildForm('user@example.com'))
    expect(result).toEqual({ success: false, message: '服务器繁忙，请稍后重试' })
  })
})