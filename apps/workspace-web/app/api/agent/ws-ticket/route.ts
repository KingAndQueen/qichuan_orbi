import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

function getGatewayServiceUrl() {
  // 优先使用网关地址（如果配置了）。
  // Prefer gateway URL if configured.
  // 注意：PUBLIC_APISIX_BASE_URL 保持向后兼容，实际使用 Nginx 网关。
  // Note: PUBLIC_APISIX_BASE_URL is kept for backward compatibility, but Nginx gateway is used.
  const gatewayUrl = process.env.PUBLIC_APISIX_BASE_URL || process.env.PUBLIC_NGINX_BASE_URL
  if (gatewayUrl) {
    return gatewayUrl
  }
  // 回退到直接访问 site-auth 服务。
  // Fallback to direct site-auth service access.
  const url = process.env.AGENT_GATEWAY_SERVICE_URL || process.env.SITE_AUTH_SERVICE_URL
  if (!url) {
    throw new Error('网关或 site-auth 服务地址未配置，无法生成 WebSocket 凭证。')
  }
  return url
}

export async function POST() {
  const sessionToken = cookies().get('site_auth_token')?.value
  const jwtToken = cookies().get('site_auth_jwt')?.value

  if (!sessionToken || !jwtToken) {
    return NextResponse.json({ message: '未登录' }, { status: 401 })
  }

  const cookieHeader = [`site_auth_token=${encodeURIComponent(sessionToken)}`, `site_auth_jwt=${encodeURIComponent(jwtToken)}`].join('; ')

  try {
    const response = await fetch(`${getGatewayServiceUrl()}/api/v1/agent/ws/tickets`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwtToken}`,
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
