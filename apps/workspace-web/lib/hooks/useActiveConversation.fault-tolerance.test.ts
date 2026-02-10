/**
 * useActiveConversation Hook - Fault Tolerance Tests
 * 活动会话钩子 - 容错测试
 *
 * Coverage / 测试覆盖:
 * - WebSocket streaming data push simulation / WebSocket 流式数据推送模拟
 * - Network timeout handling / 网络超时处理
 * - Malformed JSON frame handling / 异常 JSON 帧处理
 * - Connection loss and recovery / 连接丢失与恢复
 *
 * Compliance / 符合规范:
 * - docs/test/frontend-testing.md § Store Logic Isolation
 * - docs/test/frontend-testing.md § TC-FW-021 SSE 流式响应
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mock Setup
// ---------------------------------------------------------------------------

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: vi.fn(() => { store = {} }),
    get _store() { return store }
  }
})()

Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// AgentClient message callback reference
let messageCallback: ((event: any) => void) | null = null
let loggerCallback: ((msg: string) => void) | null = null

const mockAgentClient = {
  setLogger: vi.fn((fn) => { loggerCallback = fn }),
  onMessage: vi.fn((cb) => {
    messageCallback = cb
    return () => { messageCallback = null }
  }),
  send: vi.fn().mockResolvedValue(undefined),
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn()
}

vi.mock('../services/agent-client', () => ({
  AgentClient: mockAgentClient
}))

// ---------------------------------------------------------------------------
// Test Utilities
// ---------------------------------------------------------------------------

/**
 * Simulate receiving a WebSocket message through AgentClient
 */
function simulateMessage(event: any): void {
  if (messageCallback) {
    messageCallback(event)
  }
}

/**
 * Simulate receiving malformed JSON (this would be caught at the AgentClient level,
 * but we test how the store handles malformed payloads)
 */
function simulateMalformedPayload(conversationId: string): void {
  // Simulate what happens when upstream sends garbage
  simulateMessage({
    event: 'stream_chunk',
    conversationId,
    payload: undefined // Missing payload
  })
}

// ---------------------------------------------------------------------------
// WebSocket Fault Tolerance Tests
// ---------------------------------------------------------------------------

describe('useActiveConversation - WebSocket Fault Tolerance', () => {
  let useActiveConversation: typeof import('./useActiveConversation').useActiveConversation
  let useConversationStore: typeof import('../store/conversation').useConversationStore

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    localStorageMock.clear()

    const hookMod = await import('./useActiveConversation')
    const storeMod = await import('../store/conversation')

    useActiveConversation = hookMod.useActiveConversation
    useConversationStore = storeMod.useConversationStore

    // Initialize store
    useConversationStore.setState({
      conversations: [],
      messagesByConvId: { 'test-conv-1': [] },
      activeId: 'test-conv-1',
      input: '',
      hydrated: true,
      streaming: false,
      cancelRequested: false,
      activeRequestController: null,
      debugLogs: [],
      chips: [],
      ephemeralById: {},
      runStatusByConvId: {},
      runIdByConvId: {},
      suggestionChipsByConvId: {},
      workflowSelectedIdByConvId: {},
      errorMsg: undefined
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorageMock.clear()
    messageCallback = null
    loggerCallback = null
  })

  // ---------------------------------------------------------------------------
  // Malformed JSON Frame Tests
  // ---------------------------------------------------------------------------

  describe('Malformed JSON Frame Handling', () => {
    it('should not crash when receiving stream_chunk with undefined payload', async () => {
      const { result } = renderHook(() => useActiveConversation())

      expect(() => {
        act(() => {
          simulateMessage({
            event: 'stream_chunk',
            conversationId: 'test-conv-1',
            payload: undefined
          })
        })
      }).not.toThrow()

      // Hook should still function
      expect(result.current.messages).toEqual([])
    })

    it('should not crash when receiving stream_chunk with null payload', async () => {
      const { result } = renderHook(() => useActiveConversation())

      expect(() => {
        act(() => {
          simulateMessage({
            event: 'stream_chunk',
            conversationId: 'test-conv-1',
            payload: null
          })
        })
      }).not.toThrow()

      expect(result.current.storeReady).toBe(true)
    })

    it('should handle stream_chunk with missing messageId', async () => {
      useConversationStore.setState(state => ({
        ...state,
        messagesByConvId: {
          'test-conv-1': [{ id: 'msg-1', role: 'assistant', content: 'Initial' }]
        }
      }))

      const { result } = renderHook(() => useActiveConversation())

      act(() => {
        simulateMessage({
          event: 'stream_chunk',
          conversationId: 'test-conv-1',
          payload: { delta: 'Some content' } // Missing messageId
        })
      })

      // Original message should be unchanged
      expect(result.current.messages[0].content).toBe('Initial')
    })

    it('should handle stream_chunk with non-string delta', async () => {
      useConversationStore.setState(state => ({
        ...state,
        messagesByConvId: {
          'test-conv-1': [{ id: 'msg-1', role: 'assistant', content: '' }]
        }
      }))

      const { result } = renderHook(() => useActiveConversation())

      act(() => {
        simulateMessage({
          event: 'stream_chunk',
          conversationId: 'test-conv-1',
          payload: { messageId: 'msg-1', delta: 12345 } // Non-string delta
        })
      })

      // Delta should be coerced to string
      expect(result.current.messages[0].content).toBe('12345')
    })

    it('should handle stream_chunk with object delta', async () => {
      useConversationStore.setState(state => ({
        ...state,
        messagesByConvId: {
          'test-conv-1': [{ id: 'msg-1', role: 'assistant', content: '' }]
        }
      }))

      const { result } = renderHook(() => useActiveConversation())

      act(() => {
        simulateMessage({
          event: 'stream_chunk',
          conversationId: 'test-conv-1',
          payload: { messageId: 'msg-1', delta: { foo: 'bar' } } // Object delta
        })
      })

      // Object delta should be stringified
      expect(result.current.messages[0].content).toBe('[object Object]')
    })

    it('should handle error event with missing message field', async () => {
      const { result } = renderHook(() => useActiveConversation())

      act(() => {
        simulateMessage({
          event: 'error',
          conversationId: 'test-conv-1',
          payload: {} // Missing message
        })
      })

      expect(result.current.errorMsg).toBe('Error')
    })

    it('should handle error event with non-string message', async () => {
      const { result } = renderHook(() => useActiveConversation())

      act(() => {
        simulateMessage({
          event: 'error',
          conversationId: 'test-conv-1',
          payload: { message: { code: 500, text: 'Internal Error' } }
        })
      })

      // Should fall back to default
      expect(result.current.errorMsg).toBe('Error')
    })

    it('should handle run_update with malformed status', async () => {
      useConversationStore.setState(state => ({
        ...state,
        streaming: true
      }))

      renderHook(() => useActiveConversation())

      act(() => {
        simulateMessage({
          event: 'run_update',
          conversationId: 'test-conv-1',
          payload: { status: undefined } // Missing status
        })
      })

      const state = useConversationStore.getState()
      // Should use default 'running' status
      expect(state.runStatusByConvId!['test-conv-1']?.status).toBe('running')
    })

    it('should handle suggestion_chips with non-array chips', async () => {
      renderHook(() => useActiveConversation())

      act(() => {
        simulateMessage({
          event: 'suggestion_chips',
          conversationId: 'test-conv-1',
          payload: { chips: 'not-an-array' }
        })
      })

      const state = useConversationStore.getState()
      expect(state.suggestionChipsByConvId!['test-conv-1']).toEqual([])
    })

    it('should handle completely unknown event type gracefully', async () => {
      const { result } = renderHook(() => useActiveConversation())

      expect(() => {
        act(() => {
          simulateMessage({
            event: 'unknown_event_type',
            conversationId: 'test-conv-1',
            payload: { foo: 'bar' }
          })
        })
      }).not.toThrow()

      expect(result.current.storeReady).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // Network Timeout Simulation
  // ---------------------------------------------------------------------------

  describe('Network Timeout Handling', () => {
    it('should preserve partial content when stream is interrupted', async () => {
      useConversationStore.setState(state => ({
        ...state,
        messagesByConvId: {
          'test-conv-1': [{ id: 'msg-1', role: 'assistant', content: '' }]
        },
        streaming: true
      }))

      const { result } = renderHook(() => useActiveConversation())

      // Receive partial content
      act(() => {
        simulateMessage({
          event: 'stream_chunk',
          conversationId: 'test-conv-1',
          payload: { messageId: 'msg-1', delta: 'Hello, I am responding to' }
        })
      })

      expect(result.current.messages[0].content).toBe('Hello, I am responding to')

      // Simulate timeout (error event)
      act(() => {
        simulateMessage({
          event: 'error',
          conversationId: 'test-conv-1',
          payload: { message: 'Request timeout' }
        })
      })

      // Content should be preserved
      expect(result.current.messages[0].content).toBe('Hello, I am responding to')
      expect(result.current.errorMsg).toBe('Request timeout')
      expect(result.current.streaming).toBe(false)
    })

    it('should stop streaming state on error', async () => {
      useConversationStore.setState(state => ({
        ...state,
        streaming: true
      }))

      const { result } = renderHook(() => useActiveConversation())

      expect(result.current.streaming).toBe(true)

      act(() => {
        simulateMessage({
          event: 'error',
          conversationId: 'test-conv-1',
          payload: { message: 'Connection timeout' }
        })
      })

      expect(result.current.streaming).toBe(false)
    })

    it('should handle delayed chunks after timeout gracefully', async () => {
      useConversationStore.setState(state => ({
        ...state,
        messagesByConvId: {
          'test-conv-1': [{ id: 'msg-1', role: 'assistant', content: 'Before timeout' }]
        },
        streaming: false,
        errorMsg: 'Timeout occurred'
      }))

      const { result } = renderHook(() => useActiveConversation())

      // Late chunk arrives after timeout
      act(() => {
        simulateMessage({
          event: 'stream_chunk',
          conversationId: 'test-conv-1',
          payload: { messageId: 'msg-1', delta: ' (late)' }
        })
      })

      // Content should still be appended (store doesn't reject late chunks)
      expect(result.current.messages[0].content).toBe('Before timeout (late)')
    })

    it('should allow recovery after timeout by clearing error and retrying', async () => {
      useConversationStore.setState(state => ({
        ...state,
        streaming: false,
        errorMsg: 'Network timeout'
      }))

      const { result } = renderHook(() => useActiveConversation())

      expect(result.current.errorMsg).toBe('Network timeout')

      // Clear error
      act(() => {
        result.current.clearError()
      })

      expect(result.current.errorMsg).toBeUndefined()

      // User can now retry
      useConversationStore.setState(state => ({
        ...state,
        streaming: true,
        messagesByConvId: {
          'test-conv-1': [{ id: 'msg-new', role: 'assistant', content: '' }]
        }
      }))

      act(() => {
        simulateMessage({
          event: 'stream_chunk',
          conversationId: 'test-conv-1',
          payload: { messageId: 'msg-new', delta: 'Retry successful' }
        })
      })

      expect(result.current.messages[0].content).toBe('Retry successful')
    })
  })

  // ---------------------------------------------------------------------------
  // Connection Loss and Recovery
  // ---------------------------------------------------------------------------

  describe('Connection Loss and Recovery', () => {
    it('should handle sudden connection close during streaming', async () => {
      useConversationStore.setState(state => ({
        ...state,
        streaming: true,
        messagesByConvId: {
          'test-conv-1': [{ id: 'msg-1', role: 'assistant', content: 'Partial...' }]
        }
      }))

      const { result } = renderHook(() => useActiveConversation())

      // Simulate connection close error
      act(() => {
        simulateMessage({
          event: 'error',
          conversationId: 'test-conv-1',
          payload: { message: 'WebSocket connection closed unexpectedly' }
        })
      })

      expect(result.current.streaming).toBe(false)
      expect(result.current.errorMsg).toContain('WebSocket')
      expect(result.current.messages[0].content).toBe('Partial...')
    })

    it('should handle multiple rapid error events', async () => {
      useConversationStore.setState(state => ({
        ...state,
        streaming: true
      }))

      renderHook(() => useActiveConversation())

      // Multiple rapid error events (e.g., connection flapping)
      act(() => {
        simulateMessage({
          event: 'error',
          conversationId: 'test-conv-1',
          payload: { message: 'Error 1' }
        })
        simulateMessage({
          event: 'error',
          conversationId: 'test-conv-1',
          payload: { message: 'Error 2' }
        })
        simulateMessage({
          event: 'error',
          conversationId: 'test-conv-1',
          payload: { message: 'Error 3' }
        })
      })

      const state = useConversationStore.getState()
      expect(state.streaming).toBe(false)
      expect(state.errorMsg).toBe('Error 3') // Last error wins
    })

    it('should maintain conversation history after reconnection', async () => {
      // Setup with existing messages
      useConversationStore.setState(state => ({
        ...state,
        messagesByConvId: {
          'test-conv-1': [
            { id: 'msg-1', role: 'user', content: 'Hello' },
            { id: 'msg-2', role: 'assistant', content: 'Hi there!' }
          ]
        }
      }))

      const { result } = renderHook(() => useActiveConversation())

      // Simulate connection error
      act(() => {
        simulateMessage({
          event: 'error',
          conversationId: 'test-conv-1',
          payload: { message: 'Disconnected' }
        })
      })

      // Clear error (simulating reconnection)
      act(() => {
        result.current.clearError()
      })

      // History should be preserved
      expect(result.current.messages).toHaveLength(2)
      expect(result.current.messages[0].content).toBe('Hello')
      expect(result.current.messages[1].content).toBe('Hi there!')
    })

    it('should handle run_update with failed status and preserve messages', async () => {
      useConversationStore.setState(state => ({
        ...state,
        streaming: true,
        messagesByConvId: {
          'test-conv-1': [{ id: 'msg-1', role: 'assistant', content: 'Incomplete response' }]
        },
        runIdByConvId: { 'test-conv-1': 'run-123' }
      }))

      const { result } = renderHook(() => useActiveConversation())

      act(() => {
        simulateMessage({
          event: 'run_update',
          conversationId: 'test-conv-1',
          payload: { status: 'failed', stepName: 'Connection lost' }
        })
      })

      // Streaming should stop
      expect(result.current.streaming).toBe(false)

      // Message content preserved
      expect(result.current.messages[0].content).toBe('Incomplete response')

      // Run ID should be cleaned up
      const state = useConversationStore.getState()
      expect(state.runIdByConvId!['test-conv-1']).toBeUndefined()
    })
  })

  // ---------------------------------------------------------------------------
  // UI State Consistency
  // ---------------------------------------------------------------------------

  describe('UI State Consistency During Errors', () => {
    it('should not freeze when receiving events for inactive conversation', async () => {
      useConversationStore.setState(state => ({
        ...state,
        activeId: 'test-conv-1',
        messagesByConvId: {
          'test-conv-1': [],
          'test-conv-2': [{ id: 'msg-1', role: 'assistant', content: '' }]
        }
      }))

      const { result } = renderHook(() => useActiveConversation())

      // Event for different conversation
      act(() => {
        simulateMessage({
          event: 'stream_chunk',
          conversationId: 'test-conv-2',
          payload: { messageId: 'msg-1', delta: 'Background update' }
        })
      })

      // Active conversation should be unaffected
      expect(result.current.messages).toHaveLength(0)

      // Background conversation should be updated
      const state = useConversationStore.getState()
      expect(state.messagesByConvId['test-conv-2'][0].content).toBe('Background update')
    })

    it('should maintain input state during error conditions', async () => {
      useConversationStore.setState(state => ({
        ...state,
        input: 'Draft message in progress'
      }))

      const { result } = renderHook(() => useActiveConversation())

      act(() => {
        simulateMessage({
          event: 'error',
          conversationId: 'test-conv-1',
          payload: { message: 'Server error' }
        })
      })

      // Input should be preserved
      expect(result.current.input).toBe('Draft message in progress')
    })

    it('should allow typing during streaming', async () => {
      useConversationStore.setState(state => ({
        ...state,
        streaming: true,
        input: ''
      }))

      const { result } = renderHook(() => useActiveConversation())

      // User types while streaming
      act(() => {
        result.current.setInput('Next message')
      })

      // Stream chunk arrives
      act(() => {
        simulateMessage({
          event: 'stream_chunk',
          conversationId: 'test-conv-1',
          payload: { messageId: 'msg-1', delta: 'Response content' }
        })
      })

      // Input should be preserved
      expect(result.current.input).toBe('Next message')
    })

    it('should handle rapid stream updates without blocking UI', async () => {
      useConversationStore.setState(state => ({
        ...state,
        messagesByConvId: {
          'test-conv-1': [{ id: 'msg-1', role: 'assistant', content: '' }]
        }
      }))

      const { result } = renderHook(() => useActiveConversation())

      // Simulate 500 rapid chunks
      act(() => {
        for (let i = 0; i < 500; i++) {
          simulateMessage({
            event: 'stream_chunk',
            conversationId: 'test-conv-1',
            payload: { messageId: 'msg-1', delta: 'x' }
          })
        }
      })

      // Content should have all 500 characters
      expect(result.current.messages[0].content).toBe('x'.repeat(500))
    })
  })

  // ---------------------------------------------------------------------------
  // Edge Cases
  // ---------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle event with missing conversationId', async () => {
      const { result } = renderHook(() => useActiveConversation())

      expect(() => {
        act(() => {
          simulateMessage({
            event: 'stream_chunk',
            conversationId: undefined,
            payload: { messageId: 'msg-1', delta: 'test' }
          })
        })
      }).not.toThrow()

      // Should be silently ignored
      expect(result.current.messages).toHaveLength(0)
    })

    it('should handle empty string conversationId', async () => {
      renderHook(() => useActiveConversation())

      expect(() => {
        act(() => {
          simulateMessage({
            event: 'stream_chunk',
            conversationId: '',
            payload: { messageId: 'msg-1', delta: 'test' }
          })
        })
      }).not.toThrow()
    })

    it('should handle very long delta strings', async () => {
      useConversationStore.setState(state => ({
        ...state,
        messagesByConvId: {
          'test-conv-1': [{ id: 'msg-1', role: 'assistant', content: '' }]
        }
      }))

      const { result } = renderHook(() => useActiveConversation())

      const veryLongDelta = 'x'.repeat(100000)

      act(() => {
        simulateMessage({
          event: 'stream_chunk',
          conversationId: 'test-conv-1',
          payload: { messageId: 'msg-1', delta: veryLongDelta }
        })
      })

      expect(result.current.messages[0].content.length).toBe(100000)
    })

    it('should handle special characters in delta', async () => {
      useConversationStore.setState(state => ({
        ...state,
        messagesByConvId: {
          'test-conv-1': [{ id: 'msg-1', role: 'assistant', content: '' }]
        }
      }))

      const { result } = renderHook(() => useActiveConversation())

      const specialChars = '你好世界 🎉 <script>alert("xss")</script> \n\t\r'

      act(() => {
        simulateMessage({
          event: 'stream_chunk',
          conversationId: 'test-conv-1',
          payload: { messageId: 'msg-1', delta: specialChars }
        })
      })

      expect(result.current.messages[0].content).toBe(specialChars)
    })

    it('should handle null message in messagesByConvId', async () => {
      useConversationStore.setState(state => ({
        ...state,
        messagesByConvId: {
          'test-conv-1': null as any // Malformed state
        }
      }))

      const { result } = renderHook(() => useActiveConversation())

      // Should return empty array, not crash
      expect(result.current.messages).toEqual([])
    })
  })
})
