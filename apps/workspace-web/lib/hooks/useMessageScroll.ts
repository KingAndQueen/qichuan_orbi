/**
 * useMessageScroll Hook - Message List Scroll Behavior
 * 消息列表滚动行为 Hook
 * 
 * Clean and simple scroll logic with 4 clear strategies:
 * 清晰简洁的滚动逻辑，4 种明确策略：
 * 
 * 1. Conversation Switch → Instant scroll to bottom (no animation)
 *    切换对话 → 瞬间定位到底部（无动画）
 * 
 * 2. Page Refresh → Restore saved position (keep user's reading position)
 *    页面刷新 → 恢复保存的位置（保持用户阅读位置）
 * 
 * 3. New Message Sent → Smooth scroll to user message top (with animation)
 *    发送新消息 → 平滑滚动到用户消息顶部（有动画）
 * 
 * 4. Streaming → No auto-scroll (user controls)
 *    流式输出 → 不自动滚动（用户控制）
 * 
 * @see docs/frontend-interaction-guidelines.md
 */

import { useEffect, useRef } from 'react'

// localStorage key for current conversation's scroll position
const SCROLL_STORAGE_KEY = 'of:current-scroll:v2'

// Save current conversation's scroll position
function saveScrollPosition(convId: string, position: number) {
  try {
    localStorage.setItem(SCROLL_STORAGE_KEY, JSON.stringify({ convId, scrollTop: position }))
  } catch {
    // Silently fail if localStorage is unavailable
  }
}

// Get saved scroll position (only for current conversation)
function getSavedScrollPosition(convId: string): number | undefined {
  try {
    const data = JSON.parse(localStorage.getItem(SCROLL_STORAGE_KEY) || '{}')
    // Only restore position if it's the same conversation
    return data.convId === convId ? data.scrollTop : undefined
  } catch {
    return undefined
  }
}

export type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string }

interface UseMessageScrollProps {
  scrollRef: React.RefObject<HTMLDivElement>
  messages: ChatMessage[]
  activeId?: string
  streaming: boolean
}

type ScrollStrategy =
  | { type: 'conversation-switch' }
  | { type: 'page-refresh'; savedPosition?: number }
  | { type: 'new-message'; userMessageId: string }
  | { type: 'none' }

export function useMessageScroll({ scrollRef, messages, activeId }: UseMessageScrollProps) {
  // Track previous state to determine scroll strategy
  const prevActiveIdRef = useRef<string | undefined>(undefined)
  const prevMessagesLengthRef = useRef<number>(0)
  const isInitialMountRef = useRef<boolean>(true)

  // Save scroll position on scroll (throttled) for page refresh recovery
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !activeId) return

    let saveTimeout: NodeJS.Timeout

    const onScroll = () => {
      clearTimeout(saveTimeout)
      saveTimeout = setTimeout(() => {
        saveScrollPosition(activeId, el.scrollTop)
      }, 200)
    }

    el.addEventListener('scroll', onScroll)
    return () => {
      el.removeEventListener('scroll', onScroll)
      clearTimeout(saveTimeout)
    }
  }, [activeId, scrollRef])

  // Effect: Apply scrolling strategy when strategy changes
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !el.isConnected) return

    // Capture previous state
    const prevActiveId = prevActiveIdRef.current
    const prevMessagesLength = prevMessagesLengthRef.current
    const wasInitialMount = isInitialMountRef.current

    // Update refs for next render
    prevActiveIdRef.current = activeId
    prevMessagesLengthRef.current = messages.length
    isInitialMountRef.current = false

    // Determine scroll strategy
    const strategy = determineScrollStrategy()

    // Execute scroll based on strategy
    executeScrollStrategy(el, strategy)

    function determineScrollStrategy(): ScrollStrategy {
      // Priority 1: Conversation switch → Instant scroll to bottom
      const isConversationSwitch = prevActiveId !== undefined && prevActiveId !== activeId
      if (isConversationSwitch && activeId) {
        return { type: 'conversation-switch' }
      }

      // Priority 2: Page refresh → Restore saved position
      if (wasInitialMount && activeId && messages.length > 0) {
        const savedPosition = getSavedScrollPosition(activeId)
        return { type: 'page-refresh', savedPosition }
      }

      // Priority 3: New message sent → Smooth scroll to user message top
      const hasNewMessage = messages.length > prevMessagesLength
      if (hasNewMessage) {
        const latestUserMsg = messages.slice().reverse().find(m => m.role === 'user')
        if (latestUserMsg) {
          return { type: 'new-message', userMessageId: latestUserMsg.id }
        }
      }

      // Priority 4: Streaming or no action needed
      return { type: 'none' }
    }

    function executeScrollStrategy(element: HTMLDivElement, strategy: ScrollStrategy) {
      switch (strategy.type) {
        case 'conversation-switch':
          // Instant scroll to bottom (no animation)
          element.scrollTop = element.scrollHeight
          break

        case 'page-refresh':
          // Restore saved position (instant)
          if (strategy.savedPosition !== undefined) {
            element.scrollTop = strategy.savedPosition
          } else {
            element.scrollTop = element.scrollHeight
          }
          break

        case 'new-message': {
          // Instant align: place the latest user message flush to the top of the scroll container
          // 瞬时贴顶：将最新用户消息与滚动容器顶部对齐（避免平滑动画与流式更新竞态）
          const userMsgEl = element.querySelector(`[data-message-id="${strategy.userMessageId}"]`) as HTMLElement | null
          if (userMsgEl) {
            try {
              // Compute delta using bounding rects to avoid window scrollIntoView side-effects
              const containerRect = element.getBoundingClientRect()
              const targetRect = userMsgEl.getBoundingClientRect()
              const delta = targetRect.top - containerRect.top
              element.scrollTop += delta
            } catch {
              // Fallback: jump to current scrollTop (no-op) if layout info isn't available
            }
          }
          break
        }

        case 'none':
          // No action during streaming or other cases
          break
      }
    }
  }, [messages, activeId, scrollRef]) // Only depend on messages, activeId, and stable ref
  // streaming and scrollRef changes should not trigger scroll logic
}
