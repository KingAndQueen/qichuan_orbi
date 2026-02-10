/**
 * MessageList scroll behavior test - Anchor to user message
 * 消息列表滚动行为测试 - 锚定用户消息
 * 
 * Tests the new scroll behavior where:
 * - When user sends a message, data-message-id attribute is set correctly
 * - Messages are rendered with proper structure for scroll anchoring
 * - Scroll logic doesn't crash during streaming
 * 
 * 测试新的滚动行为：
 * - 用户发送消息时，data-message-id 属性正确设置
 * - 消息以正确的结构渲染，支持滚动锚定
 * - 流式输出时滚动逻辑不会崩溃
 */
import React from 'react'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders as render } from '../vitest.setup'
import Page from '../app/page'
import { useAuthStore } from '../lib/store/auth'

describe('MessageList scroll behavior - anchor to user message', () => {
  beforeEach(() => {
    // Mock authenticated state for all tests
    useAuthStore.setState({ 
      user: { id: 'u', name: '测试用户', username: 'testuser' }, 
      status: 'authenticated',
      initialized: true 
    })
  })

  it('renders messages with data-message-id attribute for scroll anchoring', async () => {
    render(<Page />)

    // Send a message
    const textarea = screen.getByPlaceholderText('输入消息...') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Test question' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })

    // Wait for messages to render
    await waitFor(() => {
      expect(screen.getByTestId('message-row-user')).toBeInTheDocument()
    })

    // Verify user message has data-message-id attribute
    const userMessageRow = screen.getByTestId('message-row-user')
    expect(userMessageRow).toHaveAttribute('data-message-id')
    expect(userMessageRow.getAttribute('data-message-id')).toBeTruthy()

    // Verify assistant message also has data-message-id
    await waitFor(() => {
      const assistantRow = screen.queryByTestId('message-row-assistant')
      if (assistantRow) {
        expect(assistantRow).toHaveAttribute('data-message-id')
      }
    })
  })

  it('does not crash during streaming', async () => {
    render(<Page />)

    // Send a message
    const textarea = screen.getByPlaceholderText('输入消息...') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Stream test' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })

    // Wait for message rendering
    await new Promise(r => setTimeout(r, 50))

    // During streaming, component should not crash
    const messageList = document.querySelector('[aria-live="polite"]')
    expect(messageList).toBeInTheDocument()

    // Verify message structure exists (may have multiple user messages in other tests)
    const userMessageRows = screen.queryAllByTestId('message-row-user')
    expect(userMessageRows.length).toBeGreaterThanOrEqual(1)

    // Wait for streaming to complete
    await new Promise(r => setTimeout(r, 150))
    
    // After streaming, messages should still be rendered
    expect(messageList).toBeInTheDocument()
  })

  it('renders multiple messages with correct structure', async () => {
    render(<Page />)

    // Send first message
    let textarea = screen.getByPlaceholderText('输入消息...') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'First message' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })

    // Wait for first message to render and streaming to complete
    await new Promise(r => setTimeout(r, 200))

    // Send second message
    textarea = screen.getByPlaceholderText('输入消息...') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Second message' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })

    // Wait for second message
    await waitFor(() => {
      const userRows = screen.queryAllByTestId('message-row-user')
      expect(userRows.length).toBeGreaterThanOrEqual(2)
    }, { timeout: 1000 })

    // Verify all messages have data-message-id
    const allMessageRows = document.querySelectorAll('[data-message-id]')
    expect(allMessageRows.length).toBeGreaterThanOrEqual(2)
    
    // Each should have a unique ID
    const ids = Array.from(allMessageRows).map(el => el.getAttribute('data-message-id'))
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length) // All IDs are unique
  })

  it('maintains scroll container structure', async () => {
    render(<Page />)

    // Verify scroll container exists
    const scrollContainer = document.querySelector('[aria-live="polite"]')
    expect(scrollContainer).toBeInTheDocument()
    
    // Verify it has overflow-auto for scrolling
    expect(scrollContainer).toHaveClass('overflow-auto')
  })
})
