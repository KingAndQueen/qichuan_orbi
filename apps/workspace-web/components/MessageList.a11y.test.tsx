import React from 'react'
import { fireEvent, screen } from '@testing-library/react'
import { renderWithProviders as render } from '../vitest.setup'
import Page from '../app/page'
import { MessageList } from './MessageList'

describe('MessageList a11y (Page integration)', () => {
  it('renders messages with proper aria-live region - no avatars, Gemini style', async () => {
    render(<Page />)
    const input = screen.getByPlaceholderText('输入消息...') as HTMLTextAreaElement
    // send two messages to create user->assistant interaction
    fireEvent.change(input, { target: { value: 'hello' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await new Promise(r => setTimeout(r, 20))
    fireEvent.change(input, { target: { value: 'another' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await new Promise(r => setTimeout(r, 20))
    // Assert messages exist via test IDs (no avatars in Gemini-style)
    expect(screen.getAllByTestId(/message-row/).length).toBeGreaterThan(0)
    // Assert aria-live region exists
    expect(document.querySelector('[aria-live="polite"]')).toBeInTheDocument()
  })
})

const messages = [
  { id: '1', role: 'user' as const, content: 'hi' },
  { id: '2', role: 'assistant' as const, content: 'hello' },
  { id: '3', role: 'assistant' as const, content: 'world' },
]

describe('MessageList avatars & meta (unit)', () => {
  it('renders aria-live polite on container', () => {
    render(<MessageList messages={messages} />)
    const container = document.querySelector('[aria-live="polite"]') as HTMLElement
    expect(container).toBeTruthy()
  })

  it('renders messages without avatars - Gemini style', () => {
    render(<MessageList messages={messages} />)
    // No avatars - messages distinguished by background color only (Gemini style)
    const rows = screen.getAllByTestId(/message-row/)
    expect(rows.length).toBe(messages.length)
    // Messages are present and accessible
    expect(screen.getByText('hi')).toBeInTheDocument()
    expect(screen.getByText('hello')).toBeInTheDocument()
  })
})
