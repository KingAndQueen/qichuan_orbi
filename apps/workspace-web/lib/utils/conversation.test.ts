import { describe, it, expect, vi, afterEach } from 'vitest'
import {
    createRandomId,
    generateTitleFrom,
    validateInput,
    createMessagePair,
    determineNextConversationState
} from './conversation'
import { ConversationState } from '../types/conversation'

describe('Conversation Utils', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('createRandomId', () => {
        it('should generate ID with specified prefix', () => {
            const id = createRandomId('c')
            expect(id).toMatch(/^c-/)
        })

        it('should generate ID with reasonable length', () => {
            const prefix = 'test'
            const id = createRandomId(prefix)
            expect(id.length).toBeGreaterThan(prefix.length + 1)
        })
    })

    describe('generateTitleFrom', () => {
        it('should return original text for short input', () => {
            const text = 'Hello World'
            expect(generateTitleFrom(text)).toBe(text)
        })

        it('should truncate long text with ellipsis', () => {
            const longText = 'This is a very long text that exceeds thirty characters limit'
            const title = generateTitleFrom(longText)
            expect(title.length).toBeLessThanOrEqual(25) // 24 chars + ... (or similar logic in implementation)
            expect(title).toMatch(/…$/)
        })

        it('should return default title for empty or whitespace input', () => {
            expect(generateTitleFrom('')).toBe('新建对话')
            expect(generateTitleFrom('   ')).toBe('新建对话')
        })
    })

    describe('validateInput', () => {
        it('should trim whitespace', () => {
            expect(validateInput(' hello ')).toBe('hello')
        })

        it('should return null for empty or whitespace only input', () => {
            expect(validateInput('')).toBeNull()
            expect(validateInput('   ')).toBeNull()
        })
    })

    describe('createMessagePair', () => {
        it('should create a pair of user and assistant messages', () => {
            const prompt = 'test prompt'
            const { userMessage, assistantMessage, runId } = createMessagePair(prompt)

            expect(userMessage).toEqual(expect.objectContaining({
                role: 'user',
                content: prompt
            }))
            expect(userMessage.id).toMatch(/^u-/)

            expect(assistantMessage).toEqual(expect.objectContaining({
                role: 'assistant',
                content: ''
            }))
            expect(assistantMessage.id).toMatch(/^a-/)

            expect(runId).toMatch(/^run-/)
        })
    })

    describe('determineNextConversationState', () => {
        const mockState: Partial<ConversationState> = {
            conversations: [],
            messagesByConvId: {},
            activeId: 'c-1',
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
            workflowSelectedIdByConvId: {}
        }

        const baseArgs = {
            state: mockState as ConversationState,
            conversationId: 'c-new',
            prompt: 'Hello',
            userMessage: { id: 'u-1', role: 'user' as const, content: 'Hello' },
            assistantMessage: { id: 'a-1', role: 'assistant' as const, content: '' },
            runId: 'run-1',
            controller: new AbortController(),
            historySource: [],
            isEphemeral: false,
            isInList: false,
            conversationMeta: { id: 'c-new', title: 'New Chat', createdAt: Date.now(), pinnedAt: null },
            timestamp: Date.now()
        }

        it('Scenario A: New conversation (not in list)', () => {
            const result = determineNextConversationState(baseArgs)

            expect(result.conversations).toHaveLength(1)
            expect(result.conversations![0].id).toBe('c-new')
            expect(result.messagesByConvId!['c-new']).toHaveLength(2) // user + assistant
            expect(result.runStatus?.status).toBe('pending')
            expect(result.streaming).toBe(true)
        })

        it('Scenario B: Existing conversation (in list)', () => {
            const existingConv = { id: 'c-exist', title: 'Old Title', createdAt: 1000, pinnedAt: null }
            const stateWithConv = {
                ...mockState,
                conversations: [existingConv],
                messagesByConvId: { 'c-exist': [] }
            }

            const args = {
                ...baseArgs,
                state: stateWithConv as ConversationState,
                conversationId: 'c-exist',
                isInList: true,
                conversationMeta: existingConv // Should be ignored if isInList is true based on logic, but passed for type safety
            }

            const result = determineNextConversationState(args)

            expect(result.conversations).toHaveLength(1)
            expect(result.conversations![0].id).toBe('c-exist')
            // Verify lastMessageAt updated
            expect(result.conversations![0].lastMessageAt).toBe(args.timestamp)
            // Title shouldn't change if it's not default
            expect(result.conversations![0].title).toBe('Old Title')
        })

        it('Scenario B: Existing conversation with default title should update title', () => {
            const existingConv = { id: 'c-exist', title: '新建对话', createdAt: 1000, pinnedAt: null }
            const stateWithConv = {
                ...mockState,
                conversations: [existingConv]
            }

            const args = {
                ...baseArgs,
                state: stateWithConv as ConversationState,
                conversationId: 'c-exist',
                isInList: true,
                prompt: 'New Topic',
                conversationMeta: existingConv
            }

            const result = determineNextConversationState(args)

            expect(result.conversations![0].title).toBe('New Topic')
        })
    })
})
