import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'

const { cookiesMock, cookieJar } = vi.hoisted(() => {
  const jar = new Map<string, string>()
  const cookiesMock = vi.fn(() => ({
    get: (name: string) => {
      const value = jar.get(name)
      return value ? { name, value } : undefined
    },
  }))
  return { cookiesMock, cookieJar: jar }
})

vi.mock('next/headers', () => ({
  cookies: cookiesMock,
}))

describe('POST /api/agent/ws-ticket', () => {
  const originalEnv = process.env.PUBLIC_NGINX_BASE_URL
  const fetchMock = vi.spyOn(globalThis, 'fetch')

  beforeEach(() => {
    cookieJar.clear()
    process.env.PUBLIC_NGINX_BASE_URL = 'http://gateway.test'
    cookiesMock.mockClear()
    fetchMock.mockReset()
  })

  afterEach(() => {
    process.env.PUBLIC_NGINX_BASE_URL = originalEnv
  })

  it('returns 401 when session or JWT cookie is missing', async () => {
    cookieJar.set('site_auth_token', 'session-token')
    const response = await POST()
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ message: '未登录' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('forwards JWT for gateway auth while sending session cookie to backend', async () => {
    cookieJar.set('site_auth_token', 'session token')
    cookieJar.set('site_auth_jwt', 'jwt-token')

    // Create a proper Response object to avoid MSW conflicts
    const mockResponse = new Response(
      JSON.stringify({ ticket: 't-1' }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    )

    fetchMock.mockResolvedValue(mockResponse)

    const response = await POST()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [arg1, arg2] = fetchMock.mock.calls[0]

    // Try to extract headers from Request object or init object
    const headers = (arg1 as any)?.headers || (arg2 as any)?.headers
    const headersObj = headers && typeof headers.entries === 'function'
      ? Object.fromEntries(headers.entries())
      : headers

    expect(headersObj).toMatchObject({
      authorization: 'Bearer jwt-token',
      cookie: 'site_auth_token=session%20token; site_auth_jwt=jwt-token',
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ticket: 't-1' })
  })
})
