import '@testing-library/jest-dom'

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { render, type RenderOptions } from '@testing-library/react'

// MSW setup for auth endpoints in tests
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { vi, beforeEach } from 'vitest'

// ---- Mock Next.js runtime hooks that expect App Router/Theme providers ----

// A lightweight router implementation so components using useRouter() don't throw.
const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  prefetch: vi.fn().mockResolvedValue(undefined),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
}

const mockUseSearchParams = vi.fn(() => new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search))
const mockRedirect = vi.fn((url: string) => {
  throw new Error(`Unexpected redirect to ${url}`)
})

beforeEach(() => {
  mockRouter.push.mockReset()
  mockRouter.replace.mockReset()
  mockRouter.prefetch.mockClear()
  mockRouter.back.mockReset()
  mockRouter.forward.mockReset()
  mockRouter.refresh.mockReset()
  mockUseSearchParams.mockImplementation(() => new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search))
  mockRedirect.mockImplementation((url: string) => {
    throw new Error(`Unexpected redirect to ${url}`)
  })
})

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/',
  useSearchParams: mockUseSearchParams,
  redirect: mockRedirect,
  notFound: () => {
    throw new Error('notFound() was called during tests')
  },
}))

type ThemeContextValue = {
  theme: string
  resolvedTheme: string
  setTheme: (theme: string) => void
  themes: string[]
  forcedTheme?: string
  systemTheme?: string
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

interface MockThemeProviderProps {
  children: React.ReactNode
  attribute?: string
  defaultTheme?: string
  storageKey?: string
}

const MockThemeProvider: React.FC<MockThemeProviderProps> = ({
  children,
  attribute = 'data-theme',
  defaultTheme = 'light',
}) => {
  const [theme, setThemeState] = useState(defaultTheme)

  const setTheme = (nextTheme: string) => {
    setThemeState(nextTheme)
  }

  useEffect(() => {
    if (typeof document === 'undefined') return
    if (attribute) {
      document.documentElement.setAttribute(attribute, theme)
    }
  }, [attribute, theme])

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme: theme,
      setTheme,
      themes: ['light', 'dark'],
      systemTheme: 'light',
    }),
    [theme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

vi.mock('next-themes', () => ({
  ThemeProvider: MockThemeProvider,
  useTheme: () => {
    const ctx = useContext(ThemeContext)
    if (!ctx) {
      throw new Error('useTheme must be used within MockThemeProvider')
    }
    return ctx
  },
}))

const server = setupServer(
  http.get('/api/v1/auth/:provider/url', ({ params }) => {
    const provider = String((params as any).provider)
    const authorizeUrl = `/auth/callback?provider=${provider}&code=mockcode`
    return HttpResponse.json({ authorizeUrl })
  }),
  http.post('/api/v1/auth/:provider/callback', async ({ params, request }) => {
    const provider = String((params as any).provider)
    const body = await request.json() as any
    if (!body?.code) {
      return new HttpResponse('bad request', { status: 400 })
    }
    return HttpResponse.json({
      token: `mock-token-${provider}`,
      user: { id: 'u1', name: '测试用户' }
    })
  })
)

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

// Mock scrollIntoView for tests (jsdom doesn't implement it)
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function() {
    // No-op for tests
  }
}

// Mock URL.createObjectURL and revokeObjectURL for file upload tests
// Node.js implementation is stricter than browser: it only accepts Blob, not File
// In tests, we mock it to accept both and return a fake blob URL
if (typeof URL !== 'undefined') {
  const mockBlobUrls = new Set<string>()

  URL.createObjectURL = vi.fn((_obj: Blob | File) => {
    const mockUrl = `blob:vitest-mock-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    mockBlobUrls.add(mockUrl)
    return mockUrl
  })

  URL.revokeObjectURL = vi.fn((url: string) => {
    mockBlobUrls.delete(url)
  })
}

// Export test utilities for convenience
// This helper wraps components with necessary providers (Theme, etc.)
export function renderWithProviders(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(
    <MockThemeProvider defaultTheme="light">
      {ui}
    </MockThemeProvider>,
    options
  )
}

// Re-export everything from testing-library for convenience
export * from '@testing-library/react'
export { renderWithProviders as render }
