// apps/workspace-web/lib/services/agent-client.ts
import { GatewayEnvelope } from '../types/conversation'

// 单例模式管理连接
let socket: WebSocket | null = null
let connectPromise: Promise<void> | null = null
const listeners = new Set<(event: GatewayEnvelope) => void>()
let logger: ((msg: string) => void) | null = null

function log(msg: string) {
  if (logger) logger(msg)
  // 开发环境保留 console，生产环境可由 logger 接管
  if (process.env.NODE_ENV === 'development') console.log(`[AgentClient] ${msg}`)
}

// 动态获取 WS 地址 (Rule: Runtime Discovery)
function getWsUrl(): string {
  if (typeof window === 'undefined') return ''
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws/agent`
}

// 获取 Ticket (Rule: Relative Path)
async function fetchTicket(signal?: AbortSignal): Promise<string> {
  const res = await fetch('/api/agent/ws-ticket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal
  })
  if (!res.ok) throw new Error(`Ticket failed: ${res.status}`)
  const data = await res.json()
  return data.ticket
}

export const AgentClient = {
  // 注入外部日志记录器 (用于 Store debugLogs)
  setLogger(fn: (msg: string) => void) {
    logger = fn
  },

  onMessage(cb: (event: GatewayEnvelope) => void) {
    listeners.add(cb)
    return () => listeners.delete(cb)
  },

  async connect(signal?: AbortSignal): Promise<void> {
    if (socket?.readyState === WebSocket.OPEN) return
    if (connectPromise) return connectPromise

    connectPromise = (async () => {
      try {
        log('Fetching ticket...')
        const ticket = await fetchTicket(signal)
        const url = `${getWsUrl()}?ticket=${ticket}`
        
        log(`Connecting to ${url}`)
        
        await new Promise<void>((resolve, reject) => {
          const ws = new WebSocket(url)
          
          ws.onopen = () => {
            socket = ws
            log('✅ Connected')
            resolve()
          }
          
          ws.onmessage = (e) => {
            try {
              const payload = JSON.parse(e.data)
              listeners.forEach(cb => cb(payload))
            } catch (err) {
              log(`❌ Parse error: ${err}`)
            }
          }
          
          ws.onerror = () => {
             log('❌ WS Error')
             if (!socket) reject(new Error('Connection failed'))
          }
          
          ws.onclose = (e) => {
            log(`🔌 Closed: ${e.code}`)
            socket = null
            connectPromise = null
          }
        })
      } catch (e) {
        socket = null
        connectPromise = null
        throw e
      }
    })()
    
    return connectPromise
  },

  async send(envelope: GatewayEnvelope, signal?: AbortSignal) {
    await this.connect(signal)
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error('Socket not ready')
    }
    log(`📤 Sending ${envelope.event}`)
    socket.send(JSON.stringify(envelope))
  },

  disconnect() {
    if (socket) {
      socket.close()
      socket = null
    }
  }
}