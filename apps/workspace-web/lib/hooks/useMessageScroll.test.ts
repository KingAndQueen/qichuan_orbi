import { renderHook } from '@testing-library/react'
import { useMessageScroll, type ChatMessage } from './useMessageScroll'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('useMessageScroll', () => {
  let mockScrollTo: any
  // 模拟一个具有滚动属性的 Ref 对象
  let mockDiv: HTMLDivElement

  beforeEach(() => {
    mockDiv = document.createElement('div')
    mockScrollTo = vi.fn()
    mockDiv.scrollTo = mockScrollTo

    // CRITICAL: Append to document so isConnected returns true
    document.body.appendChild(mockDiv)

    // Mock 布局属性：内容高度 1000，可视高度 500 -> 需要滚动到 1000
    Object.defineProperty(mockDiv, 'scrollHeight', { value: 1000, configurable: true })
    Object.defineProperty(mockDiv, 'clientHeight', { value: 500, configurable: true })
    Object.defineProperty(mockDiv, 'scrollTop', { value: 0, configurable: true, writable: true })
  })

  afterEach(() => {
    // Clean up: remove mockDiv from document
    if (mockDiv && mockDiv.parentNode) {
      mockDiv.parentNode.removeChild(mockDiv)
    }
    vi.restoreAllMocks()
  })

  it('should scroll to bottom when switching conversations', () => {
    const scrollRef = { current: mockDiv }

    const { rerender } = renderHook(
      (props) => useMessageScroll(props),
      {
        initialProps: {
          scrollRef,
          messages: [] as ChatMessage[],
          activeId: 'c1',
          streaming: false
        }
      }
    )

    // 初始状态：scrollTop 为 0
    expect(mockDiv.scrollTop).toBe(0)

    // 模拟：切换到另一个对话
    // This triggers "conversation-switch" strategy (line 115 in hook)
    // which directly sets element.scrollTop = element.scrollHeight
    rerender({
      scrollRef,
      messages: [{ id: 'u1', role: 'user' as const, content: 'Hello' }],
      activeId: 'c2', // Different conversation ID triggers switch
      streaming: false
    })

    // 验证：scrollTop 应该被设置为 scrollHeight（滚动到底部）
    // According to line 141: element.scrollTop = element.scrollHeight
    expect(mockDiv.scrollTop).toBe(mockDiv.scrollHeight)
  })
})