import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

function getAuthServiceUrl() {
  const url = process.env.SITE_AUTH_SERVICE_URL
  if (!url) {
    throw new Error('SITE_AUTH_SERVICE_URL 未配置，无法登出。')
  }
  return url
}

export async function POST() {
  const token = cookies().get('site_auth_token')?.value

  if (token) {
    try {
      await fetch(`${getAuthServiceUrl()}/api/v1/logout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Workspace-Client': 'workspace-web',
        },
        cache: 'no-store',
      })
    } catch (error) {
      console.warn('Failed to notify Go service for logout', error)
    }
  }

  cookies().delete('site_auth_token')
  return NextResponse.json({ success: true })
}
