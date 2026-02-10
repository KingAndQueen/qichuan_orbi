/**
 * MessageList card styles test - Flattened design
 * 消息卡片样式测试 - 扁平化设计
 * 
 * Tests the flattened message card design with:
 * - No borders or shadows for cleaner look
 * - Background colors to distinguish roles (user vs assistant)
 * - Proper padding and rounded corners
 * 
 * 测试扁平化的消息卡片设计：
 * - 无边框和阴影，视觉更简洁
 * - 使用背景色区分角色（用户 vs 助手）
 * - 合适的内边距和圆角
 */
import React from 'react'
import { screen } from '@testing-library/react'
import { renderWithProviders as render } from '../vitest.setup'
import { MessageList } from './MessageList'

describe('MessageList card styles - Flattened design', () => {
  it('renders cards with padding and rounded corners (no border/shadow)', () => {
    const messages = [
      { id: '1', role: 'assistant' as const, content: 'hello' },
      { id: '2', role: 'user' as const, content: 'hi' },
    ]
    render(<MessageList messages={messages} />)

    // Find assistant card by testid (latest assistant gets special testid)
    const assistantCard = screen.getByTestId('latest-assistant-card')
    // Find user card - it should have message-card testid
    const userCards = screen.getAllByTestId('message-card')
    const userCard = userCards[0] as HTMLElement

    // Assistant card: transparent background, no border/shadow, rounded-xl (ChatGPT style)
    expect(assistantCard.className).toContain('py-3')
    expect(assistantCard.className).toContain('px-4')
    expect(assistantCard.className).toContain('rounded-xl')
    expect(assistantCard.style.background).toBe('var(--assistant-message-bg)')
    // No boxShadow or borderColor in flattened design
    expect(assistantCard.style.boxShadow).toBeFalsy()

    // User card: dark background (ChatGPT style), larger rounded corners, no border/shadow
    expect(userCard.className).toContain('py-3')
    expect(userCard.className).toContain('px-4')
    expect(userCard.className).toContain('rounded-2xl')
    expect(userCard.style.background).toBe('var(--user-message-bg)')
    expect(userCard.style.color).toBe('var(--user-message-text)')
    expect(userCard.style.boxShadow).toBeFalsy()
  })

  it('applies hover effect for assistant messages', () => {
    const messages = [
      { id: '1', role: 'assistant' as const, content: 'hello' },
    ]
    render(<MessageList messages={messages} />)
    // Single assistant message gets 'latest-assistant-card' testid
    const card = screen.getByTestId('latest-assistant-card')

    // Assistant card should have hover background transition
    expect(card.className).toContain('transition-colors')
    expect(card.className).toMatch(/hover:bg-\[var\(--assistant-message-hover-bg\)\]/)
  })

  it('distinguishes user and assistant messages by background color', () => {
    const messages = [
      { id: '1', role: 'assistant' as const, content: 'assistant message' },
      { id: '2', role: 'user' as const, content: 'user message' },
    ]
    render(<MessageList messages={messages} />)

    // Assistant (latest) has special testid
    const assistantCard = screen.getByTestId('latest-assistant-card')
    // User has regular testid
    const userCard = screen.getByTestId('message-card')

    // Different backgrounds for different roles
    expect(assistantCard.style.background).toBe('var(--assistant-message-bg)')
    expect(userCard.style.background).toBe('var(--user-message-bg)')
    expect(assistantCard.style.background).not.toBe(userCard.style.background)
  })
})
