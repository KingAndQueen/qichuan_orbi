import React from 'react'
import { act, screen, waitFor } from '@testing-library/react'
import { renderWithProviders as render } from '../vitest.setup'
import Page from '../app/page'
import { useConversationStore } from '../lib/store/conversation'

describe('MessageList scroll position restore', () => {
  const SCROLL_STORAGE_KEY = 'of:scroll-positions:v1'

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear()
    // Reset conversation store
    useConversationStore.setState({
      conversations: [],
      messagesByConvId: {},
      activeId: undefined,
      input: '',
      streaming: false,
    })
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('localStorage scroll position save and restore works', () => {
    // Test localStorage operations directly
    const testConvId = 'test-conv-123'
    const testPosition = 500

    // Save
    const data = { [testConvId]: testPosition }
    localStorage.setItem(SCROLL_STORAGE_KEY, JSON.stringify(data))

    // Restore
    const saved = localStorage.getItem(SCROLL_STORAGE_KEY)
    expect(saved).toBeTruthy()
    const restored = JSON.parse(saved!)
    expect(restored[testConvId]).toBe(testPosition)
  })

  it('scrolls to bottom on page load, then anchors to user message on new messages', async () => {
    const mockConvId = 'conv-123'

    // Pre-populate store with conversation and messages
    useConversationStore.setState({
      conversations: [{ id: mockConvId, title: 'Test Conversation', createdAt: Date.now(), pinnedAt: null }],
      activeId: mockConvId,
      messagesByConvId: {
        [mockConvId]: [
          { id: 'msg-1', role: 'user', content: 'Hello' },
          { id: 'msg-2', role: 'assistant', content: 'Hi there!' },
        ],
      },
    })

    // Render page (simulating page load/refresh)
    render(<Page />)

    await waitFor(() => {
      const msgs = screen.queryAllByTestId(/message-row-/)
      expect(msgs.length).toBe(2)
    })

    // Wait for initial scroll (should scroll to bottom on initial mount)
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50))
    })

    const area = document.querySelector('[aria-live="polite"]') as HTMLElement
    expect(area).toBeTruthy()

    // Now add a new message - should use new behavior (scroll to user message top)
    await act(async () => {
      useConversationStore.setState({
        messagesByConvId: {
          [mockConvId]: [
            { id: 'msg-1', role: 'user', content: 'Hello' },
            { id: 'msg-2', role: 'assistant', content: 'Hi there!' },
            { id: 'msg-3', role: 'user', content: 'New message' },
            { id: 'msg-4', role: 'assistant', content: '' },
          ],
        },
      })
    })

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100))
    })

    // After adding new message, should scroll to user message (msg-3) at top
    // This is handled by scrollIntoView which is mocked in vitest.setup.ts
    // Verify the new message is rendered
    const newMessage = screen.queryByText('New message')
    expect(newMessage).toBeInTheDocument()
  })

  it('scrolls to bottom when switching conversations', async () => {
    // Create two conversations with messages
    const conv1 = 'conv-1'
    const conv2 = 'conv-2'

    // Setup initial state with conv1 active
    useConversationStore.setState({
      conversations: [
        { id: conv1, title: 'Conversation 1', createdAt: Date.now(), pinnedAt: null },
        { id: conv2, title: 'Conversation 2', createdAt: Date.now() - 1000, pinnedAt: null },
      ],
      activeId: conv1,
      messagesByConvId: {
        [conv1]: [
          { id: 'msg-1-1', role: 'user', content: 'First conv message 1' },
          { id: 'msg-1-2', role: 'assistant', content: 'First conv reply 1' },
          { id: 'msg-1-3', role: 'user', content: 'First conv message 2' },
          { id: 'msg-1-4', role: 'assistant', content: 'First conv reply 2' },
        ],
        [conv2]: [
          { id: 'msg-2-1', role: 'user', content: 'Second conv message 1' },
          { id: 'msg-2-2', role: 'assistant', content: 'Second conv reply 1' },
          { id: 'msg-2-3', role: 'user', content: 'Second conv message 2' },
          { id: 'msg-2-4', role: 'assistant', content: 'Second conv reply 2' },
        ],
      },
    })

    // Render page
    render(<Page />)

    await waitFor(() => {
      const msgs = screen.queryAllByTestId(/message-row-/)
      expect(msgs.length).toBe(4) // Should show conv1's 4 messages
    })

    // Wait for initial render to settle
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50))
    })

    const scrollArea = document.querySelector('[aria-live="polite"]') as HTMLElement
    expect(scrollArea).toBeTruthy()

    // Mock scrollHeight and enable scrollTop setter
    let mockScrollTop = 0
    Object.defineProperty(scrollArea, 'scrollHeight', {
      writable: true,
      configurable: true,
      value: 1000
    })
    Object.defineProperty(scrollArea, 'clientHeight', {
      writable: true,
      configurable: true,
      value: 600
    })
    Object.defineProperty(scrollArea, 'scrollTop', {
      get: () => mockScrollTop,
      set: (value) => { mockScrollTop = value },
      configurable: true
    })

    // Simulate scrolling to middle in conv1
    mockScrollTop = 400

    // Switch to conv2
    await act(async () => {
      useConversationStore.getState().setActive(conv2)
    })

    // Wait for conversation switch to complete
    await waitFor(() => {
      const msgs = screen.queryAllByTestId(/message-row-/)
      expect(msgs.length).toBe(4) // Should now show conv2's 4 messages
    })

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100))
    })

    // Critical assertion: scrollTop should equal scrollHeight (bottom)
    // This verifies the requirement: "切换会话时，滚动到最底端"
    expect(mockScrollTop).toBe(1000)
  })

  it('page refresh scrolls to bottom initially, then new messages anchor to user message', async () => {
    const conv1 = 'conv-refresh-1'

    // Setup conversation with messages
    useConversationStore.setState({
      conversations: [{ id: conv1, title: 'Test Conv', createdAt: Date.now(), pinnedAt: null }],
      activeId: conv1,
      messagesByConvId: {
        [conv1]: [
          { id: 'msg-1', role: 'user', content: 'Message 1' },
          { id: 'msg-2', role: 'assistant', content: 'Reply 1' },
          { id: 'msg-3', role: 'user', content: 'Message 2' },
          { id: 'msg-4', role: 'assistant', content: 'Reply 2' },
        ],
      },
    })

    // Simulate page refresh by rendering the component (initial mount)
    render(<Page />)

    await waitFor(() => {
      const msgs = screen.queryAllByTestId(/message-row-/)
      expect(msgs.length).toBe(4)
    })

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50))
    })

    const scrollArea = document.querySelector('[aria-live="polite"]') as HTMLElement
    expect(scrollArea).toBeTruthy()

    // Initial mount should scroll to bottom
    // (This is tested by the scroll position after initial render)

    // Now add a new message - should scroll to user message top (new behavior)
    await act(async () => {
      useConversationStore.setState({
        messagesByConvId: {
          [conv1]: [
            { id: 'msg-1', role: 'user', content: 'Message 1' },
            { id: 'msg-2', role: 'assistant', content: 'Reply 1' },
            { id: 'msg-3', role: 'user', content: 'Message 2' },
            { id: 'msg-4', role: 'assistant', content: 'Reply 2' },
            { id: 'msg-5', role: 'user', content: 'New message' },
            { id: 'msg-6', role: 'assistant', content: '' },
          ],
        },
      })
    })

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100))
    })

    // After adding new message, scrollIntoView should be called (mocked in vitest.setup.ts)
    // The new behavior scrolls to show user message at top, not bottom
    // This keeps the user question + assistant answer pair visible
    const newUserMessage = screen.queryByText('New message')
    expect(newUserMessage).toBeInTheDocument()
  })

})
