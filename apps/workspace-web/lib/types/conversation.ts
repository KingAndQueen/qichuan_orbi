// apps/workspace-web/lib/types/conversation.ts
export type Conversation = { 
  id: string
  title: string
  createdAt: number
  pinnedAt?: number | null
  lastMessageAt?: number 
}

export type Message = { 
  id: string
  role: 'user' | 'assistant'
  content: string 
}

export type Chip = { 
  id: string
  label: string
  action: { 
    type: 'fill_input' | 'send_prompt'
    payload: string 
  } 
}

export type RunStatus = { 
  stepName: string
  status: 'pending' | 'running' | 'waiting_for_tool' | 'succeeded' | 'failed' 
}

export type GatewayEnvelope = {
  event: string
  version?: string
  conversationId?: string
  runId?: string
  payload?: any
}

export type ConversationState = {
  conversations: Conversation[]
  activeId?: string
  messagesByConvId: Record<string, Message[]>
  input: string
  streaming: boolean
  hydrated: boolean
  cancelRequested?: boolean
  activeRequestController: AbortController | null
  debugLogs: string[]
  
  // Actions
  setInput: (value: string) => void
  sendMessage: () => Promise<void>
  chips: Chip[]
  runStatus?: RunStatus
  runStatusByConvId?: Record<string, RunStatus | undefined>
  runIdByConvId?: Record<string, string | undefined>
  suggestionChipsByConvId?: Record<string, Chip[] | undefined>
  workflowSelectedIdByConvId?: Record<string, string | undefined>
  errorMsg?: string
  
  clearError: () => void
  cancelStreaming: () => void
  createConversation: () => void
  setActive: (id: string) => void
  renameConversation: (id: string, title: string) => void
  togglePinConversation: (id: string) => void
  deleteConversation: (id: string) => void
  rehydrate: () => void
  ephemeralById?: Record<string, boolean>
  startTemporaryConversation: () => void
  setWorkflowForActive: (workflowId?: string) => void
}