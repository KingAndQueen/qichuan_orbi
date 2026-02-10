import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_PATHS = [
  '/site-login',
  '/auth/callback',
  '/api/auth/session',
  '/api/auth/logout',
]

function getAuthServiceUrl() {
  const url = process.env.SITE_AUTH_SERVICE_URL
  if (!url) {
    console.warn('SITE_AUTH_SERVICE_URL 未配置，无法执行会话校验，默认拒绝请求。')
  }
  return url
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 白名单放行
  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next()
  }

  // 校验 Cookie
  const token = request.cookies.get('site_auth_token')?.value
  if (!token) {
    return redirectToLogin(request)
  }

  const authServiceUrl = getAuthServiceUrl()
  if (!authServiceUrl) {
    return redirectToLogin(request)
  }

  try {
    // 调用 Go Auth Service 校验会话
    const response = await fetch(`${authServiceUrl}/api/v1/session`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Workspace-Client': 'workspace-web',
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      return redirectToLogin(request)
    }

    return NextResponse.next()
  } catch (error) {
    console.error('调用 Go 会话服务失败', error)
    return redirectToLogin(request)
  }
}

function redirectToLogin(request: NextRequest) {
  const { pathname } = request.nextUrl
  const loginUrl = new URL('/site-login', request.url)
  loginUrl.searchParams.set('next', pathname)

  const response = NextResponse.redirect(loginUrl)
  response.cookies.delete('site_auth_token')
  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|.*\\..*).*)',
  ],
}
