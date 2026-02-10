import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from '@testing-library/react'

// Mock AgentClient
const mockAgentClient = {
    setLogger: vi.fn(),
    onMessage: vi.fn(),
    send: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn()
}

vi.mock('../services/agent-client', () => ({
    AgentClient: mockAgentClient
}))

describe('Conversation Store', () => {
    let useConversationStore: any
    let onMessageCallback: any

    beforeEach(async () => {
        vi.resetModules()
        vi.clearAllMocks()

        // Re-import to trigger initialization and capture callback
        const mod = await import('./conversation')
        useConversationStore = mod.useConversationStore

        // Reset store state
        useConversationStore.setState({
            conversations: [],
            messagesByConvId: {},
            activeId: null,
            input: '',
            streaming: false,
            runStatusByConvId: {},
            runIdByConvId: {},
            errorMsg: undefined
        })

        // Get the callback from the mock calls
        const calls = mockAgentClient.onMessage.mock.calls
        if (calls.length > 0) {
            onMessageCallback = calls[0][0]
        }
    })

    afterEach(() => {
        vi.restoreAllMocks()
        localStorage.clear()
    })

    it('sendMessage should update state and call AgentClient.send', async () => {
        const store = useConversationStore.getState()
        store.createConversation()
        const activeId = useConversationStore.getState().activeId!

        useConversationStore.setState({ input: 'hello' })

        await useConversationStore.getState().sendMessage()

        const state = useConversationStore.getState()
        expect(state.input).toBe('')
        expect(state.messagesByConvId[activeId]).toHaveLength(2) // user + assistant
        expect(state.messagesByConvId[activeId][0].content).toBe('hello')
        expect(mockAgentClient.send).toHaveBeenCalled()
    })

    it('should handle stream_chunk updates', () => {
        const store = useConversationStore.getState()
        store.createConversation()
        const activeId = useConversationStore.getState().activeId!

        // Manually add an assistant message
        useConversationStore.setState((s: any) => ({
            messagesByConvId: {
                ...s.messagesByConvId,
                [activeId]: [{ id: 'msg-1', role: 'assistant', content: '' }]
            }
        }))

        expect(onMessageCallback).toBeDefined()

        // Simulate stream chunk
        act(() => {
            onMessageCallback({
                event: 'stream_chunk',
                conversationId: activeId,
                payload: { messageId: 'msg-1', delta: 'Hello' }
            })
        })

        expect(useConversationStore.getState().messagesByConvId[activeId][0].content).toBe('Hello')

        // Simulate another chunk
        act(() => {
            onMessageCallback({
                event: 'stream_chunk',
                conversationId: activeId,
                payload: { messageId: 'msg-1', delta: ' World' }
            })
        })

        expect(useConversationStore.getState().messagesByConvId[activeId][0].content).toBe('Hello World')
    })

    it('should handle run_update (succeeded)', () => {
        const store = useConversationStore.getState()
        store.createConversation()
        const activeId = useConversationStore.getState().activeId!

        useConversationStore.setState({ streaming: true })

        expect(onMessageCallback).toBeDefined()

        act(() => {
            onMessageCallback({
                event: 'run_update',
                conversationId: activeId,
                payload: { status: 'succeeded' }
            })
        })

        const state = useConversationStore.getState()
        expect(state.streaming).toBe(false)
        expect(state.runStatusByConvId[activeId]?.status).toBe('succeeded')
    })

    it('deleteConversation should remove conversation and switch activeId', () => {
        const store = useConversationStore.getState()
        store.createConversation()
        const id1 = useConversationStore.getState().activeId!

        store.createConversation()
        const id2 = useConversationStore.getState().activeId!

        useConversationStore.setState({
            conversations: [
                { id: id1, title: 'C1', createdAt: 1, pinnedAt: null },
                { id: id2, title: 'C2', createdAt: 2, pinnedAt: null }
            ],
            activeId: id1
        })

        store.deleteConversation(id1)

        const state = useConversationStore.getState()
        expect(state.conversations).toHaveLength(1)
        expect(state.conversations[0].id).toBe(id2)
        expect(state.activeId).toBe(id2)
        expect(state.messagesByConvId[id1]).toBeUndefined()
    })

    it('renameConversation should update title', () => {
        const store = useConversationStore.getState()
        const id = 'c-1'
        useConversationStore.setState({
            conversations: [{ id, title: 'Old', createdAt: 1, pinnedAt: null }],
            activeId: id
        })

        store.renameConversation(id, 'New Title')

        const state = useConversationStore.getState()
        expect(state.conversations[0].title).toBe('New Title')
    })
})
