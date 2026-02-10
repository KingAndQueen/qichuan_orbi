// apps/workspace-web/app/debug/page.tsx
"use client"

import React, { useState, useRef, useEffect } from 'react'
import { notFound } from 'next/navigation'

// 简单的 UUID 生成器
const uuidv4 = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export default function DebugPage() {
  // [安全防护] 仅在开发环境启用，生产环境返回 404
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      notFound()
    }
  }, [])

  const [logs, setLogs] = useState<string[]>([])
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle')
  const wsRef = useRef<WebSocket | null>(null)
  
  const addLog = (msg: string) => {
    const time = new Date().toISOString().split('T')[1].slice(0, -1)
    setLogs(prev => [`[${time}] ${msg}`, ...prev])
    console.log(`[DEBUG] ${msg}`)
  }

  const fetchTicket = async () => {
    addLog('Step 1: 开始获取 Ticket...')
    try {
      const res = await fetch('/api/agent/ws-ticket', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      
      if (!res.ok) {
        throw new Error(`Ticket 请求失败: ${res.status} ${res.statusText}`)
      }
      
      const data = await res.json()
      addLog(`Step 1 Success: 获取 Ticket 成功: ${data.ticket?.slice(0, 8)}...`)
      return data.ticket
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e)
      addLog(`Step 1 Error: ${errMsg}`)
      setStatus('error')
      throw e
    }
  }

  const connectWs = async () => {
    if (wsRef.current) {
      wsRef.current.close()
    }

    setStatus('connecting')
    try {
      const ticket = await fetchTicket()
      
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const host = window.location.host 
      const wsUrl = `${protocol}//${host}/ws/agent?ticket=${ticket}`
      
      addLog(`Step 2: 正在连接 WS: ${wsUrl}`)
      
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        addLog('Step 2 Success: WebSocket 连接已打开 (onopen)')
        setStatus('connected')
      }

      ws.onmessage = (event) => {
        const raw = event.data;
        try {
          const data = JSON.parse(raw)
          if (data.event === 'run_update') {
             addLog(`📥 [RECV] Run Update: Status=${data.payload?.status}, Step=${data.payload?.stepName}`)
          } else if (data.event === 'stream_chunk') {
             const delta = data.payload?.delta || ""
             addLog(`📝 [CHUNK] "${delta.replace(/\n/g, '\\n')}" (Final=${data.payload?.final})`)
          } else if (data.event === 'error') {
             addLog(`❌ [ERROR] ${JSON.stringify(data.payload)}`)
          } else {
             addLog(`📥 [RECV] ${data.event}: ${JSON.stringify(data.payload).slice(0, 100)}...`)
          }
        } catch {
          addLog(`📥 [RECV-RAW] ${raw}`)
        }
      }

      ws.onerror = (e) => {
        addLog('Step 2 Error: WebSocket 发生错误')
        console.error(e)
        setStatus('error')
      }

      ws.onclose = (e) => {
        addLog(`Step 2 Info: WebSocket 连接关闭 (code=${e.code}, reason=${e.reason})`)
        setStatus('idle')
      }

    } catch {
      addLog('连接流程中断')
    }
  }

  const sendMessage = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      addLog('Error: WS 未连接，无法发送')
      return
    }

    const runId = uuidv4()
    const conversationId = uuidv4()
    const messageId = uuidv4()

    const innerPayload = {
      text: "你好，这是一条测试消息 (Ping)",
      messageId: messageId,
      runId: runId,
      replyMessageId: uuidv4(),
      workflowId: "", 
      history: [],
      meta: {}
    }

    const envelope = {
      event: "user_message",
      version: "2.0",
      conversationId: conversationId,
      payload: innerPayload
    }

    addLog(`Step 3: 发送消息 (RunID: ${runId.slice(0,8)})`)
    addLog(`📤 [SEND] ${JSON.stringify(envelope)}`)
    
    wsRef.current.send(JSON.stringify(envelope))
  }

  if (process.env.NODE_ENV === 'production') return null

  return (
    <div className="p-6 max-w-4xl mx-auto font-mono text-sm">
      <h1 className="text-xl font-bold mb-4">🔎 通信链路调试 (Bare Metal Debug)</h1>
      <div className="mb-6 flex gap-4">
        <button onClick={connectWs} disabled={status === 'connected'} className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50">1. 连接 WebSocket</button>
        <button onClick={sendMessage} disabled={status !== 'connected'} className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50">2. 发送测试消息</button>
        <button onClick={() => setLogs([])} className="px-4 py-2 bg-gray-500 text-white rounded">清空日志</button>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div><h3 className="font-bold mb-2">连接状态: <span className={`font-bold ${status === 'connected' ? 'text-green-600' : status === 'error' ? 'text-red-600' : 'text-gray-600'}`}>{status.toUpperCase()}</span></h3></div>
      </div>
      <div className="mt-4 border border-gray-700 rounded bg-[#0d1117] text-[#c9d1d9] p-4 h-[600px] overflow-y-auto font-mono text-xs shadow-inner">
        {logs.map((log, i) => (
          <div key={i} className={`border-b border-gray-800 pb-1 mb-1 break-all ${log.includes('[ERROR]') ? 'text-red-400' : log.includes('[SEND]') ? 'text-blue-400' : log.includes('[RECV]') ? 'text-green-400' : ''}`}>{log}</div>
        ))}
      </div>
    </div>
  )
}