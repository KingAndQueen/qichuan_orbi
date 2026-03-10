/**
 * MessageList Component - Chat Message Display & Scroll Management
 * 消息列表组件 - 聊天消息显示与滚动管理
 */
"use client"
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useConversationStore } from '../lib/store/conversation'
import { TaskProgressMonitorPanel } from './TaskProgressMonitorPanel'
import { useMessageScroll } from '../lib/hooks/useMessageScroll'

export type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string }

export function MessageList({ messages, onRequestComposerFocus }: { messages: ChatMessage[]; onRequestComposerFocus?: () => void }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [followMode, setFollowMode] = useState(false)

  // [FIX] 使用 Hook 订阅状态
  const { streaming, activeId, setInput, runStatusByConvId, suggestionChipsByConvId } = useConversationStore() as any

  const lastAssistantId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'assistant') return messages[i].id
    return undefined
  }, [messages])

  useMessageScroll({ scrollRef, messages, activeId, streaming })

  // ... (Bottom sentinel & IntersectionObserver logic) ...
  useEffect(() => {
    const root = scrollRef.current
    const sentinel = sentinelRef.current
    if (!root || !sentinel) return
    const fallbackToBottom = () => {
      if (typeof window === 'undefined' || typeof window.requestAnimationFrame === 'undefined') {
        setIsAtBottom(true); setFollowMode(true); return
      }
      const frame = window.requestAnimationFrame(() => { setIsAtBottom(true); setFollowMode(true) })
      return () => window.cancelAnimationFrame(frame)
    }
    const hasObserver = typeof window !== 'undefined' && 'IntersectionObserver' in window
    if (!hasObserver) return fallbackToBottom()
    let io: IntersectionObserver | null = null
    try {
      io = new IntersectionObserver((entries) => {
        const entry = entries[0]
        const atBottom = !!entry?.isIntersecting
        setIsAtBottom(atBottom)
        setFollowMode(atBottom)
      }, { root, threshold: 1.0 })
      io.observe(sentinel)
    } catch { return fallbackToBottom() }
    return () => io?.disconnect()
  }, [])

  const lastMsgRole = messages[messages.length - 1]?.role
  useEffect(() => {
    if (lastMsgRole !== 'user') return
    const frame = requestAnimationFrame(() => setFollowMode(false))
    return () => cancelAnimationFrame(frame)
  }, [lastMsgRole])

  useEffect(() => {
    if (!followMode) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, followMode, streaming])

  return (
    <div ref={scrollRef} className="relative h-full overflow-auto pb-28 of-scroll-container" aria-live="polite">
      <div className="space-y-3 p-4">
        {messages.map((m) => {
          const isAssistant = m.role === 'assistant'
          const isUser = m.role === 'user'

          const rs = (isAssistant && activeId) ? runStatusByConvId?.[activeId] : undefined

          // [FIX] 关键修改：增加 ( ... || []) 兜底，防止 undefined 导致 .map 报错
          const chips = (isAssistant && activeId) ? (suggestionChipsByConvId?.[activeId] || []) : []

          return (
            <div
              key={m.id}
              className={`flex items-start group max-w-[min(840px,95%)] mx-auto gap-4 md:gap-5 ${isUser ? 'justify-end' : ''}`}
              data-testid={isUser ? 'message-row-user' : 'message-row-assistant'}
              data-message-id={m.id}
            >
              {isAssistant && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-1 shadow-sm" style={{ background: 'var(--color-primary-bg)', color: 'var(--color-primary)' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-bot"><path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" /><path d="M2 14h2" /><path d="M20 14h2" /><path d="M15 13v2" /><path d="M9 13v2" /></svg>
                </div>
              )}
              <div className={`min-w-0 ${isUser ? 'max-w-[85%] md:max-w-[75%] order-first' : 'flex-1'}`}>
                {isUser && (
                  <div
                    data-testid="message-card"
                    className="py-3 px-5 rounded-2xl rounded-tr-sm shadow-sm text-base leading-relaxed"
                    style={{ background: 'var(--user-message-bg)', color: 'var(--user-message-text)' }}
                  >
                    <div className="whitespace-pre-wrap break-words">{m.content}</div>
                  </div>
                )}

                {isAssistant && m.id === lastAssistantId && (() => {
                  const taskCompleted = !rs || rs.status === 'succeeded' || rs.status === 'failed'
                  const hasContent = m.content.length > 0

                  return (
                    <>
                      {/* Task Progress Panel */}
                      {rs && (
                        <div className="mb-3" aria-label="任务进度区域">
                          <TaskProgressMonitorPanel
                            tasks={[{
                              runId: activeId || 'mock-run',
                              steps: [{ stepName: rs.stepName, status: rs.status }]
                            }]}
                            defaultCollapsed={true}
                          />
                        </div>
                      )}

                      {/* Text Content */}
                      {taskCompleted && hasContent && (
                        <div
                          data-testid="latest-assistant-card"
                          className="py-2.5 rounded-xl text-base leading-relaxed"
                          style={{ color: 'var(--color-text)' }}
                        >
                          {streaming && m.id === lastAssistantId ? (
                            <div className="whitespace-pre-wrap break-words">
                              {m.content}<span aria-label="typing-caret" className="streaming-caret">▍</span>
                            </div>
                          ) : (
                            <div className="whitespace-pre-wrap break-words">{m.content}</div>
                          )}
                        </div>
                      )}
                    </>
                  )
                })()}

                {isAssistant && m.id !== lastAssistantId && (
                  <div
                    data-testid="message-card"
                    className="py-2.5 rounded-xl text-base leading-relaxed"
                    style={{ color: 'var(--color-text)' }}
                  >
                    <div className="whitespace-pre-wrap break-words">{m.content}</div>
                  </div>
                )}

                {/* Inline suggestions */}
                {isAssistant && m.id === lastAssistantId && rs?.status === 'succeeded' ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="inline-suggestion-row">
                    <span
                      role="link"
                      tabIndex={0}
                      onClick={() => { setInput?.('建议输入'); onRequestComposerFocus?.() }}
                      className="inline-flex items-center px-4 py-2 text-sm font-medium hover:bg-[var(--color-hover-bg)] transition-colors"
                      style={{ background: 'var(--color-fill-secondary)', color: 'var(--color-text-secondary)', cursor: 'pointer', borderRadius: '20px', border: '1px solid var(--color-border)' }}
                    >
                      建议输入
                    </span>
                    {chips.map((chip: any) => (
                      <span
                        key={chip.id}
                        role="link"
                        tabIndex={0}
                        onClick={() => { const payload = chip?.action?.payload ?? chip?.label; setInput?.(String(payload || '')); onRequestComposerFocus?.() }}
                        className="inline-flex items-center px-4 py-2 text-sm font-medium hover:bg-[var(--color-hover-bg)] transition-colors"
                        style={{ background: 'var(--color-fill-secondary)', color: 'var(--color-text-secondary)', cursor: 'pointer', borderRadius: '20px', border: '1px solid var(--color-border)' }}
                      >
                        {chip.label}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
      <div ref={sentinelRef} data-testid="bottom-sentinel" style={{ height: 1 }} />
      {!isAtBottom && (
        <button
          type="button"
          className="fixed right-6 bottom-28 rounded-full bg-indigo-600 text-white px-3 py-2 shadow transition-all"
          style={{ cursor: 'pointer' }}
          onClick={() => { const el = scrollRef.current; if (!el) return; el.scrollTop = el.scrollHeight; setFollowMode(true) }}
        >
          ↓ 滚动至最新
        </button>
      )}
    </div>
  )
}