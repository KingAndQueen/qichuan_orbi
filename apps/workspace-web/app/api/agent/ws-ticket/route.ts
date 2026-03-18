import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

function getAuthOrGatewayUrl() {
  const gatewayUrl = process.env.PUBLIC_APISIX_BASE_URL || process.env.PUBLIC_NGINX_BASE_URL
  if (gatewayUrl) {
    return gatewayUrl
  }
  // WS Tickets are strictly issued by site-auth service.
  // When bypassing the gateway, we must hit the site-auth service directly.
  const url = process.env.SITE_AUTH_SERVICE_URL
  if (!url) {
    throw new Error('网关或 site-auth 服务地址未配置，无法生成 WebSocket 凭证。')
  }
  return url
}

export async function POST() {
  const sessionToken = cookies().get('site_auth_token')?.value
  const jwtToken = cookies().get('site_auth_jwt')?.value || ''

  console.log('[DEBUG] WS Ticket Request:', {
    hasSessionToken: !!sessionToken,
    url: `${getAuthOrGatewayUrl()}/api/v1/agent/ws/tickets`
  })

  // We only strictly need the session token to authenticate with the Go backend directly.
  if (!sessionToken) {
    return NextResponse.json({ message: '未登录' }, { status: 401 })
  }

  const cookieHeader = [`site_auth_token=${encodeURIComponent(sessionToken)}`, jwtToken ? `site_auth_jwt=${encodeURIComponent(jwtToken)}` : ''].filter(Boolean).join('; ')

  try {
    const response = await fetch(`${getAuthOrGatewayUrl()}/api/v1/agent/ws/tickets`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        Cookie: cookieHeader,
        'Content-Type': 'application/json',
        'X-Workspace-Client': 'workspace-web',
      },
      cache: 'no-store',
    })

    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      return NextResponse.json(
        { message: payload?.message || '无法生成 WebSocket 凭证', code: payload?.code || 'gateway_error' },
        { status: response.status }
      )
    }

    return NextResponse.json(payload)
  } catch (error) {
    console.warn('Failed to create agent gateway ticket', error)
    return NextResponse.json({ message: '服务器繁忙，请稍后重试' }, { status: 500 })
  }
}
