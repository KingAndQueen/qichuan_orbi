// apps/workspace-web/lib/services/agent-client.ts
import { GatewayEnvelope } from '../types/conversation'

const listeners = new Set<(event: GatewayEnvelope) => void>()
let logger: ((msg: string) => void) | null = null

function log(msg: string) {
  if (logger) logger(msg)
  if (process.env.NODE_ENV === 'development') console.log(`[AgentClient] ${msg}`)
}

export const AgentClient = {
  setLogger(fn: (msg: string) => void) {
    logger = fn
  },

  onMessage(cb: (event: GatewayEnvelope) => void) {
    listeners.add(cb)
    return () => listeners.delete(cb)
  },

  async connect(signal?: AbortSignal): Promise<void> {
    // HTTP is stateless, no long-lived connection needed before sending
    return Promise.resolve()
  },

  async send(envelope: GatewayEnvelope, signal?: AbortSignal) {
    log(`📤 Sending HTTP stream request (event: ${envelope.event})`)
    
    // We only proxy user messages to the agent stream
    if (envelope.event !== 'user_message') {
       log(`Skipped non-chat event: ${envelope.event}`)
       return
    }

    const { conversationId, payload } = envelope
    
    // Map Frontend payload to Backend AgentRunRequest
    const reqBody = {
      conversation_id: conversationId,
      bot_id: null,
      workflow_id: (payload as any).workflowId || "11111111-2222-3333-4444-555555555555", // default to custom Coze Bot if not provided
      messages: [{ role: 'user', content: payload.text }]
    }

    try {
      const response = await fetch('/api/agent/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
        signal
      })

      if (!response.ok) {
        throw new Error(`Stream request failed with status: ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No readable stream returned')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        
        // Keep the last incomplete line in the buffer
        buffer = lines.pop() || ''

        let currentEvent = 'message'
        
        for (const line of lines) {
          if (line.trim() === '') continue // End of an event
          
          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim()
          } else if (line.startsWith('data:')) {
            const dataStr = line.slice(5).trim()
            try {
              const dataObj = JSON.parse(dataStr)
              
              // We must wrap the python payload back into the GatewayEnvelope format Next.js expects
              const mappedEnvelope: GatewayEnvelope = {
                 event: currentEvent as any,
                 version: '2.0',
                 conversationId: conversationId,
                 payload: dataObj,
                 runId: undefined
              }
              
              listeners.forEach(cb => cb(mappedEnvelope))
            } catch (err) {
              log(`❌ Failed to parse SSE chunks: ${err}`)
            }
          }
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        log(`❌ Stream Error: ${e}`)
        throw e
      } else {
        log('🛑 Stream explicitly aborted.')
      }
    }
  },

  disconnect() {
    // No-op for HTTP
  }
}