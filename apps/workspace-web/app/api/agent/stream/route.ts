import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  const sessionToken = cookies().get('site_auth_token')?.value
  
  if (!sessionToken) {
    return NextResponse.json({ message: '未登录' }, { status: 401 })
  }

  const payload = await req.json()
  const agentUrl = process.env.AGENT_GATEWAY_SERVICE_URL || 'http://localhost:8050'

  try {
    const response = await fetch(`${agentUrl}/v1/agent/runs/stream`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    
    // We can just pipe the readable stream returned by fetch directly back to the client!
    return new NextResponse(response.body, {
      status: response.status,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive'
      }
    })
  } catch (err) {
    console.error('Agent stream proxy failed:', err)
    return NextResponse.json({ message: '后端服务不可用' }, { status: 502 })
  }
}
