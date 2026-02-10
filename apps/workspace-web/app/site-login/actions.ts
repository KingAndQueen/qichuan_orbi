"use server"

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

function getAuthServiceUrl() {
  const url = process.env.SITE_AUTH_SERVICE_URL
  if (!url) {
    throw new Error('SITE_AUTH_SERVICE_URL 未配置，无法完成账号登录流程。')
  }
  return url
}

type LoginResult = {
  success: boolean
  message: string
}

type LoginResponse = {
  token: string
  jwtToken?: string
  expiresInSeconds: number
}

type IdentifierType = 'email' | 'phone' | 'username'

const inferIdentifierType = (value: string): IdentifierType => {
  const trimmed = value.trim()
  const lower = trimmed.toLowerCase()
  if (lower.includes('@')) {
    return 'email'
  }
  const digits = trimmed.replace(/[^0-9+]/g, '')
  if (/^\+?\d{6,15}$/.test(digits)) {
    return 'phone'
  }
  return 'username'
}

const delay = async (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function loginAction(formData: FormData): Promise<LoginResult | void> {
  const identifier = (formData.get('identifier') as string | null) ?? ''
  const password = (formData.get('password') as string | null) ?? ''
  const rawNext = (formData.get('next') as string | null) ?? '/'
  const nextUrl = rawNext.startsWith('/') ? rawNext : '/'

  if (!identifier.trim() || !password) {
    return { success: false, message: '账号和密码不能为空' }
  }

  const identifierType = inferIdentifierType(identifier)

  try {
    const response = await fetch(`${getAuthServiceUrl()}/api/v1/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Workspace-Client': 'workspace-web',
      },
      body: JSON.stringify({ identifier, identifierType, password }),
      cache: 'no-store',
    })

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string; code?: string } | null
      const code = payload?.code ?? 'error'
      if (code === 'locked') {
        await delay(500)
        return { success: false, message: '尝试次数过多，请稍后再试' }
      }
      if (code === 'disabled') {
        await delay(500)
        return { success: false, message: '账号已被禁用，请联系管理员' }
      }
      await delay(500)
      return { success: false, message: payload?.message ?? '账号或密码错误' }
    }

    const payload = (await response.json()) as LoginResponse
    const maxAge = Math.max(payload.expiresInSeconds ?? 0, 0)

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: maxAge || 60 * 60 * 24,
      sameSite: 'lax',
    } as const

    cookies().set('site_auth_token', payload.token, cookieOptions)
    if (payload.jwtToken) {
      cookies().set('site_auth_jwt', payload.jwtToken, cookieOptions)
    }

    redirect(nextUrl || '/')
  } catch (error) {
    if ((error as Error & { digest?: string }).digest?.startsWith('NEXT_REDIRECT')) {
      throw error
    }
    console.error('Failed to complete login', error)
    await delay(500)
    return { success: false, message: '服务器繁忙，请稍后重试' }
  }
}
