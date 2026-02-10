// apps/workspace-web/app/debug-store/page.tsx
"use client"

import React, { useEffect, useState } from 'react'
import { notFound } from 'next/navigation'
import { useConversationStore } from '@/lib/store/conversation'

export default function DebugStorePage() {
  // [安全防护]
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      notFound()
    }
  }, [])

  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMounted(true)
  }, [])

  const {
    createConversation,
    sendMessage,
    // input, // 移除未使用的变量
    setInput,
    messagesByConvId,
    activeId,
    runStatusByConvId,
    debugLogs
  } = useConversationStore()

  const [localLogs, setLocalLogs] = useState<string[]>([])

  const addLog = (msg: string) => {
    const time = new Date().toISOString().split('T')[1].slice(0, -1)
    setLocalLogs(prev => [`[${time}] ${msg}`, ...prev])
  }

  const handleInit = () => {
    createConversation()
    addLog('Step 1: 创建新会话')
  }

  const handleSend = async () => {
    if (!activeId) {
      addLog('❌ Error: 无激活会话')
      return
    }
    addLog(`Step 2: 设置输入并发送...`)
    setInput('你好，这是一条来自 Store 的测试消息')
    setTimeout(async () => {
      await sendMessage()
      addLog('Step 3: sendMessage 调用完成')
    }, 100)
  }

  if (process.env.NODE_ENV === 'production') return null
  if (!isMounted) return <div className="p-6 font-mono">Initializing Debugger...</div>

  const activeMessages = activeId ? (messagesByConvId[activeId] || []) : []
  const activeStatus = activeId ? runStatusByConvId?.[activeId] : null

  return (
    <div className="p-6 max-w-6xl mx-auto font-mono text-sm">
      <h1 className="text-xl font-bold mb-4">🧪 Store 内部透视 (Debug Store)</h1>

      <div className="mb-6 flex gap-4 border-b pb-4">
        <button onClick={handleInit} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">1. 新会话</button>
        <button onClick={handleSend} disabled={!activeId} className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50 hover:bg-green-700">2. 发送</button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="border border-gray-300 rounded p-4 bg-gray-50 h-[600px] overflow-auto col-span-1">
          <h3 className="font-bold border-b mb-2">Store State</h3>
          <div className="mb-2">ID: {activeId?.slice(0, 8)}...</div>
          <div className="mb-2">Status: <span className="bg-blue-100 px-1">{activeStatus?.status || 'idle'}</span></div>
          <div className="font-bold mb-1 mt-4">Messages:</div>
          <div className="space-y-2">
            {activeMessages.map((m) => (
              <div key={m.id} className={`p-2 rounded text-xs ${m.role === 'user' ? 'bg-blue-100' : 'bg-green-100'}`}>
                <div className="font-bold text-gray-500">{m.role} ({m.id.slice(0, 4)})</div>
                <div className="whitespace-pre-wrap">{m.content || '(empty...)'}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="border border-yellow-600 rounded bg-[#2d2a1e] text-[#f0e68c] p-4 h-[600px] overflow-y-auto col-span-1">
          <h3 className="font-bold border-b border-yellow-600 mb-2 text-white">Store Internal Logs</h3>
          {debugLogs && debugLogs.length === 0 && <div className="italic opacity-50">等待 Store 活动...</div>}
          {debugLogs && debugLogs.map((log, i) => (
            <div key={i} className="border-b border-yellow-800 pb-1 mb-1 text-xs break-all">{log}</div>
          ))}
        </div>

        <div className="border border-gray-700 rounded bg-[#0d1117] text-[#c9d1d9] p-4 h-[600px] overflow-y-auto col-span-1">
          <h3 className="font-bold border-b border-gray-600 mb-2 text-white">Page Logs</h3>
          {localLogs.map((log, i) => <div key={i} className="pb-1 mb-1 border-b border-gray-800">{log}</div>)}
        </div>
      </div>
    </div>
  )
}