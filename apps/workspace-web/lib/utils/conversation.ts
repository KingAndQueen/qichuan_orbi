// apps/workspace-web/lib/utils/conversation.ts
import { Conversation, ConversationState, Message, RunStatus } from '../types/conversation'

export function createRandomId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

export function createDraftConversation(): Conversation {
  return { 
    id: createRandomId('c'), 
    title: '新建对话', 
    createdAt: Date.now(), 
    pinnedAt: null 
  }
}

export function generateTitleFrom(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ')
  return t.length > 24 ? `${t.slice(0, 24)}…` : (t || '新建对话')
}

export function validateInput(input: string): string | null {
  const trimmed = input.trim()
  return trimmed ? trimmed : null
}

export function createMessagePair(prompt: string): { userMessage: Message; assistantMessage: Message; runId: string } {
  const userMessage: Message = { id: createRandomId('u'), role: 'user', content: prompt }
  const assistantMessage: Message = { id: createRandomId('a'), role: 'assistant', content: '' }
  const runId = createRandomId('run')
  return { userMessage, assistantMessage, runId }
}

type NextStateArgs = {
  state: ConversationState
  conversationId: string
  prompt: string
  userMessage: Message
  assistantMessage: Message
  runId: string
  controller: AbortController
  historySource: Message[]
  isEphemeral: boolean
  isInList: boolean
  conversationMeta: Conversation
  timestamp: number
}

// 纯逻辑：计算下一个状态，不涉及副作用
export function determineNextConversationState(args: NextStateArgs): Partial<ConversationState> {
  const {
    state, conversationId, prompt, userMessage, assistantMessage, runId, controller,
    historySource, isEphemeral, isInList, conversationMeta, timestamp
  } = args

  const nextMessages = {
    ...state.messagesByConvId,
    [conversationId]: [...historySource, userMessage, assistantMessage],
  }

  let nextConversations = state.conversations
  if (!isEphemeral) {
    if (isInList) {
      nextConversations = state.conversations.map((c) =>
        c.id === conversationId 
          ? { ...c, title: c.title === '新建对话' || !c.title ? generateTitleFrom(prompt) : c.title, lastMessageAt: timestamp } 
          : c
      )
    } else {
      nextConversations = [...state.conversations, conversationMeta]
    }
  }

  const runStatus: RunStatus = { stepName: '准备中', status: 'pending' }

  return {
    errorMsg: undefined,
    conversations: nextConversations,
    messagesByConvId: nextMessages,
    runStatus,
    runStatusByConvId: { ...(state.runStatusByConvId || {}), [conversationId]: runStatus },
    runIdByConvId: { ...(state.runIdByConvId || {}), [conversationId]: runId },
    streaming: true,
    cancelRequested: false,
    activeRequestController: controller,
    activeId: conversationId,
  }
}