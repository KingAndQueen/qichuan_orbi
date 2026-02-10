import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

function getAuthServiceUrl() {
  const url = process.env.SITE_AUTH_SERVICE_URL
  if (!url) {
    throw new Error('SITE_AUTH_SERVICE_URL 未配置，无法校验会话。')
  }
  return url
}

export async function GET() {
  const token = cookies().get('site_auth_token')?.value
  if (!token) {
    return NextResponse.json({ message: '未登录' }, { status: 401 })
  }

  try {
    const response = await fetch(`${getAuthServiceUrl()}/api/v1/session`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Workspace-Client': 'workspace-web',
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      cookies().delete('site_auth_token')
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    const payload = (await response.json()) as {
      user: { id: string; name: string; username: string }
    }

    return NextResponse.json(payload)
  } catch (error) {
    console.warn('Session validation via Go service failed', error)
    cookies().delete('site_auth_token')
    return NextResponse.json({ message: '未登录' }, { status: 401 })
  }
}
