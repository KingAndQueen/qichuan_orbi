// apps/workspace-web/lib/store/conversation.ts
"use client"
import { createWithEqualityFn } from 'zustand/traditional'
import { ConversationState, RunStatus } from '../types/conversation'
// [FIX] 引入 generateTitleFrom 用于生成动态标题
import { createDraftConversation, createMessagePair, determineNextConversationState, validateInput, generateTitleFrom } from '../utils/conversation'
import { AgentClient } from '../services/agent-client'

// [FIX 1] 关键修复：重新导出所有类型，兼容旧代码的引用
export * from '../types/conversation'

const STORAGE_KEY = 'of:conversations:v1'

// 持久化逻辑
function persistState(state: Partial<ConversationState>) {
  try {
    const { conversations, activeId, messagesByConvId } = state as ConversationState
    // 只持久化核心数据
    if (conversations && activeId && messagesByConvId) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ conversations, activeId, messagesByConvId }))
    }
  } catch { }
}

function loadPersisted(): Partial<ConversationState> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch { return null }
}

export const useConversationStore = createWithEqualityFn<ConversationState>((set, get) => {
  const draft = createDraftConversation()

  // 1. 初始化网络层日志监听
  AgentClient.setLogger((msg) => {
    const time = new Date().toISOString().split('T')[1].slice(0, -1)
    set(s => ({ debugLogs: [`[${time}] ${msg}`, ...s.debugLogs].slice(0, 50) }))
  })

  // 2. 注册 WebSocket 消息处理 (业务逻辑层)
  AgentClient.onMessage((event) => {
    const { conversationId, payload } = event
    if (!conversationId) return

    const state = get()
    const updates: Partial<ConversationState> = {}
    let shouldPersist = false

    switch (event.event) {
      case 'run_update': {
        const status = (payload?.status as RunStatus['status']) || 'running'
        updates.runStatusByConvId = {
          ...(state.runStatusByConvId || {}),
          [conversationId]: { stepName: payload?.stepName || '进行中', status }
        }
        if (state.activeId === conversationId) {
          updates.runStatus = updates.runStatusByConvId[conversationId]
        }
        if (status === 'failed' || status === 'succeeded') {
          updates.streaming = false
          updates.cancelRequested = false
          updates.activeRequestController = null
          const nextRunIdByConvId = { ...(state.runIdByConvId || {}) }
          delete nextRunIdByConvId[conversationId]
          updates.runIdByConvId = nextRunIdByConvId
        }
        break
      }
      case 'stream_chunk': {
        const msgId = payload?.messageId
        if (!msgId) break
        const delta = String(payload.delta ?? '')

        const currentMsgs = state.messagesByConvId[conversationId] || []
        let found = false
        const nextMsgs = currentMsgs.map(m => {
          if (m.id === msgId) { found = true; return { ...m, content: m.content + delta } }
          return m
        })
        if (!found) nextMsgs.push({ id: msgId, role: 'assistant', content: delta })

        updates.messagesByConvId = { ...state.messagesByConvId, [conversationId]: nextMsgs }
        shouldPersist = true
        break
      }
      case 'suggestion_chips': {
        const chips = Array.isArray(payload?.chips) ? payload.chips : []
        updates.suggestionChipsByConvId = { ...(state.suggestionChipsByConvId || {}), [conversationId]: chips }
        break
      }
      case 'error': {
        updates.streaming = false
        updates.activeRequestController = null
        updates.errorMsg = typeof payload?.message === 'string' ? payload.message : 'Error'
        break
      }
    }

    if (Object.keys(updates).length > 0) {
      set(updates)
      if (shouldPersist) persistState({ ...state, ...updates })
    }
  })

  // 3. Store 定义
  return {
    conversations: [],
    messagesByConvId: { [draft.id]: [] },
    activeId: draft.id,
    input: '',
    hydrated: false,
    streaming: false,
    cancelRequested: false,
    // [FIX 2] 补全缺失的初始状态
    activeRequestController: null,
    debugLogs: [],
    chips: [
      { id: '1', label: '帮我写一个周报', action: { type: 'fill_input', payload: '帮我写一个周报' } },
      { id: '2', label: '解释 "RAG"', action: { type: 'fill_input', payload: '解释一下 "RAG"' } },
    ],
    ephemeralById: {},
    runStatusByConvId: {},
    runIdByConvId: {},
    suggestionChipsByConvId: {},
    workflowSelectedIdByConvId: {},

    setInput: (v) => set({ input: v }),

    createConversation: () => {
      const d = createDraftConversation()
      set(s => ({ activeId: d.id, messagesByConvId: { ...s.messagesByConvId, [d.id]: [] } }))
    },

    sendMessage: async () => {
      const state = get()
      const { input, activeId } = state
      const trimmed = validateInput(input)
      if (!trimmed || !activeId) return

      const { userMessage, assistantMessage, runId } = createMessagePair(trimmed)
      const controller = new AbortController()

      // [FIX 3] 修复标题生成逻辑
      // 1. 检查当前对话是否已存在于列表中
      const isInList = state.conversations.some(c => c.id === activeId)
      // 2. 生成动态标题
      const dynamicTitle = generateTitleFrom(trimmed)

      // 乐观更新 UI
      const updates = determineNextConversationState({
        state, 
        conversationId: activeId, 
        prompt: trimmed, 
        userMessage, 
        assistantMessage, 
        runId, 
        controller,
        historySource: state.messagesByConvId[activeId] || [], 
        isEphemeral: false, 
        // 传入正确的状态和标题
        isInList: isInList, 
        conversationMeta: { id: activeId, title: dynamicTitle, createdAt: Date.now() }, 
        timestamp: Date.now()
      })
      
      set(updates)
      persistState({ ...state, ...updates })

      // 发送请求 (代理给 Service)
      try {
        await AgentClient.send({
          event: 'user_message',
          version: '2.0',
          conversationId: activeId,
          payload: {
            messageId: userMessage.id,
            text: trimmed,
            replyMessageId: assistantMessage.id,
            runId,
            history: []
          }
        }, controller.signal)
        set({ input: '' })
      } catch (e: any) {
        if (e.name !== 'AbortError') {
          set({ errorMsg: '发送失败，请重试', streaming: false, activeRequestController: null })
        }
      }
    },

    rehydrate: () => {
      const data = loadPersisted()
      if (data) set({ ...data, hydrated: true })
      else set({ hydrated: true })
    },

    setActive: (id) => set({ activeId: id }),
    renameConversation: (id, title) => {
      set(s => {
        const next = s.conversations.map(c => c.id === id ? { ...c, title } : c)
        persistState({ ...s, conversations: next })
        return { conversations: next }
      })
    },
    togglePinConversation: (id) => set(s => ({ conversations: s.conversations.map(c => c.id === id ? { ...c, pinnedAt: c.pinnedAt ? null : Date.now() } : c) })),
    deleteConversation: (id) => set(s => {
      const nextMessages = { ...s.messagesByConvId }; delete nextMessages[id]
      const nextConvs = s.conversations.filter(c => c.id !== id)
      const nextActive = s.activeId === id ? (nextConvs[0]?.id || createDraftConversation().id) : s.activeId
      persistState({ conversations: nextConvs, activeId: nextActive, messagesByConvId: nextMessages })
      return { conversations: nextConvs, activeId: nextActive, messagesByConvId: nextMessages }
    }),
    startTemporaryConversation: () => {
      const d = createDraftConversation()
      set(s => ({ activeId: d.id, messagesByConvId: { ...s.messagesByConvId, [d.id]: [] }, ephemeralById: { ...(s.ephemeralById || {}), [d.id]: true } }))
    },
    setWorkflowForActive: (wid) => set(s => ({ workflowSelectedIdByConvId: { ...(s.workflowSelectedIdByConvId || {}), [s.activeId!]: wid } })),
    clearError: () => set({ errorMsg: undefined }),
    cancelStreaming: () => {
      const { activeId, runIdByConvId, activeRequestController } = get()

      // 1. Abort HTTP/Network first
      if (activeRequestController) {
        activeRequestController.abort()
      }

      // 2. Send cancel event
      const runId = activeId ? runIdByConvId?.[activeId] : undefined
      if (runId) AgentClient.send({ event: 'cancel_run', version: '2.0', conversationId: activeId, payload: { runId } }).catch(() => { })

      set({ streaming: false, cancelRequested: true, activeRequestController: null })
    }
  }
})