/**
 * MessageList avatar grouping test
 * 消息列表头像分组测试
 * 
 * Tests that avatars are shown only for the first message in each role group.
 * This creates visual grouping and reduces clutter.
 * 
 * 测试头像仅在每个角色组的第一条消息显示。
 * 这样可以创建视觉分组并减少视觉混乱。
 */
import React from 'react'
import { screen } from '@testing-library/react'
import { renderWithProviders as render } from '../vitest.setup'
import { MessageList } from './MessageList'

describe('MessageList grouping - Gemini style (no avatars)', () => {
  it('renders all messages without avatars', () => {
    const messages = [
      { id: '1', role: 'assistant' as const, content: 'a1' },
      { id: '2', role: 'assistant' as const, content: 'a2' },
      { id: '3', role: 'user' as const, content: 'u1' },
      { id: '4', role: 'user' as const, content: 'u2' },
      { id: '5', role: 'assistant' as const, content: 'a3' },
    ]
    render(<MessageList messages={messages} />)

    // No avatars - Gemini style uses background color distinction only
    const rows = screen.getAllByTestId(/message-row/)
    expect(rows.length).toBe(5)

    // Verify messages are rendered correctly
    expect(screen.getByText('a1')).toBeInTheDocument()
    expect(screen.getByText('u1')).toBeInTheDocument()
    expect(screen.getByText('a3')).toBeInTheDocument()
  })

  it('all messages use consistent flex layout - no avatars', () => {
    const messages = [
      { id: '1', role: 'assistant' as const, content: 'assistant' },
      { id: '2', role: 'user' as const, content: 'user' },
    ]
    render(<MessageList messages={messages} />)

    // Both should use the same flex layout (no avatars, no gaps for avatars)
    const assistantRow = screen.getByTestId('message-row-assistant')
    const userRow = screen.getByTestId('message-row-user')

    expect(assistantRow.className).toContain('flex')
    expect(assistantRow.className).toContain('items-start')
    // No justify-end for user messages in flattened design
    expect(userRow.className).not.toContain('justify-end')
  })
})
